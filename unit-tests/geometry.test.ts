import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SIMULATION_STATE,
  PHYSICAL_CONSTANTS,
  type Cartesian3,
  type GroundStationConfig,
  type SatelliteFrameState,
} from "../state";
import { getGroundStationEcef } from "../src/lib/ground-station";
import { deriveGroundStationGeometryState } from "../src/lib/simulation/geometry";
import { deriveSunState, getSunEphemeris } from "../src/lib/simulation/sun";

const TEST_RADIO = {
  downlink: {
    carrierHz: 18_200_000_000,
    bandwidthHz: 250_000_000,
    polarization: "RHCP" as const,
  },
  uplink: {
    carrierHz: 28_300_000_000,
    bandwidthHz: 250_000_000,
    polarization: "RHCP" as const,
  },
};

describe("simulation geometry", () => {
  test("computes range rate and Doppler from ECEF line-of-sight motion", () => {
    const groundStation = createGroundStation({
      minElevationDeg: 0,
      horizonMask: [],
    });
    const satellite = createSatelliteFrameFromLook(
      groundStation,
      {
        azimuthDeg: 0,
        elevationDeg: 90,
        rangeM: 550_000,
      },
      123.4,
    );

    const geometry = deriveGroundStationGeometryState(
      groundStation,
      TEST_RADIO,
      PHYSICAL_CONSTANTS,
      satellite,
    );

    expect(geometry.slantRangeM).toBeCloseTo(550_000, 6);
    expect(geometry.rangeRateMps).toBeCloseTo(123.4, 9);
    expect(geometry.downlinkDopplerShiftHz).toBeCloseTo(
      -(123.4 / PHYSICAL_CONSTANTS.speedOfLightMps) * TEST_RADIO.downlink.carrierHz,
      9,
    );
    expect(geometry.uplinkDopplerShiftHz).toBeCloseTo(
      -(123.4 / PHYSICAL_CONSTANTS.speedOfLightMps) * TEST_RADIO.uplink.carrierHz,
      9,
    );
  });

  test("uses max(minElevation, horizonMask) as the visibility source of truth", () => {
    const groundStation = createGroundStation({
      minElevationDeg: 2,
      horizonMask: [
        { azimuthDeg: 0, minElevationDeg: 10 },
        { azimuthDeg: 90, minElevationDeg: 10 },
        { azimuthDeg: 180, minElevationDeg: 1 },
        { azimuthDeg: 270, minElevationDeg: 1 },
      ],
    });
    const maskedSatellite = createSatelliteFrameFromLook(groundStation, {
      azimuthDeg: 0,
      elevationDeg: 5,
      rangeM: 1_000,
    });
    const clearSatellite = createSatelliteFrameFromLook(groundStation, {
      azimuthDeg: 180,
      elevationDeg: 3,
      rangeM: 1_000,
    });

    const maskedGeometry = deriveGroundStationGeometryState(
      groundStation,
      TEST_RADIO,
      PHYSICAL_CONSTANTS,
      maskedSatellite,
    );
    const clearGeometry = deriveGroundStationGeometryState(
      groundStation,
      TEST_RADIO,
      PHYSICAL_CONSTANTS,
      clearSatellite,
    );

    expect(maskedGeometry.horizonMaskElevationDeg).toBeCloseTo(10, 9);
    expect(maskedGeometry.requiredElevationDeg).toBeCloseTo(10, 9);
    expect(maskedGeometry.clearsOperationalMask).toBe(false);
    expect(clearGeometry.horizonMaskElevationDeg).toBeCloseTo(1, 9);
    expect(clearGeometry.requiredElevationDeg).toBeCloseTo(2, 9);
    expect(clearGeometry.clearsOperationalMask).toBe(true);
  });

  test("precomputes a stable pass window for the default simulation frames", () => {
    const frames = DEFAULT_SIMULATION_STATE.frames;
    const firstInPass = frames.find((frame) => frame.groundStation.inPass);
    const lastInPass = [...frames].reverse().find((frame) => frame.groundStation.inPass);
    const apexFrame = frames.find(
      (frame) => frame.index === frame.groundStation.kApex,
    );

    expect(firstInPass?.index).toBe(518);
    expect(lastInPass?.index).toBe(1001);
    expect(apexFrame?.index).toBe(726);
    expect(firstInPass?.groundStation.passDurationSeconds).toBe(484);
    expect(frames[517].groundStation.inPass).toBe(false);
    expect(frames[518].groundStation.inPass).toBe(true);
    expect(frames[1001].groundStation.inPass).toBe(true);
    expect(frames[1002].groundStation.inPass).toBe(false);
    expect(
      frames.every(
        (frame) =>
          frame.groundStation.kIn === 518 &&
          frame.groundStation.kApex === 726 &&
          frame.groundStation.kOut === 1001 &&
          frame.groundStation.passDurationSeconds === 484 &&
          frame.groundStation.inPass === frame.groundStation.clearsOperationalMask,
      ),
    ).toBe(true);
  });
});

describe("simulation sun", () => {
  test("returns full solar exposure for a satellite on the sunward side of Earth", () => {
    const currentUnixMs = Date.UTC(2026, 3, 12, 4, 15, 5);
    const { directionEciUnit } = getSunEphemeris(currentUnixMs);
    const satellite = createSatelliteFrameAtEciPosition(
      scaleVector(
        directionEciUnit,
        PHYSICAL_CONSTANTS.earthModel.meanRadiusM + 550_000,
      ),
    );

    const sun = deriveSunState(currentUnixMs, satellite, PHYSICAL_CONSTANTS);

    expect(sun.sunExposureFactor).toBeCloseTo(1, 9);
    expect(sun.solarFluxWPerM2).toBeGreaterThan(1_300);
  });

  test("returns zero solar exposure for a satellite in Earth's umbra", () => {
    const currentUnixMs = Date.UTC(2026, 3, 12, 4, 15, 5);
    const { directionEciUnit } = getSunEphemeris(currentUnixMs);
    const satellite = createSatelliteFrameAtEciPosition(
      scaleVector(
        directionEciUnit,
        -(PHYSICAL_CONSTANTS.earthModel.meanRadiusM + 550_000),
      ),
    );

    const sun = deriveSunState(currentUnixMs, satellite, PHYSICAL_CONSTANTS);

    expect(sun.sunExposureFactor).toBe(0);
  });

  test("precomputes bounded sun exposure factors for the default simulation frames", () => {
    expect(
      DEFAULT_SIMULATION_STATE.frames.every(
        (frame) =>
          frame.sun.sunExposureFactor >= 0 &&
          frame.sun.sunExposureFactor <= 1 &&
          Number.isFinite(frame.sun.solarFluxWPerM2),
      ),
    ).toBe(true);
  });
});

function createGroundStation(
  overrides: Partial<
    Pick<GroundStationConfig, "minElevationDeg" | "horizonMask">
  > = {},
): GroundStationConfig {
  return {
    name: "Test Ground Station",
    latDeg: 0,
    lonDeg: 0,
    altitudeM: 0,
    minElevationDeg: overrides.minElevationDeg ?? 0,
    horizonMask: overrides.horizonMask ?? [],
    antenna: {
      mountType: "az-el",
      pointingMode: "fixed",
      azimuthDeg: 0,
      elevationDeg: 0,
      dishDiameterM: 1,
      gainDbi: 40,
      polarization: "RHCP",
    },
  };
}

function createSatelliteFrameFromLook(
  groundStation: GroundStationConfig,
  look: {
    azimuthDeg: number;
    elevationDeg: number;
    rangeM: number;
  },
  rangeRateMps = 0,
): SatelliteFrameState {
  const groundStationEcef = getGroundStationEcef(groundStation, PHYSICAL_CONSTANTS);
  const relativeVectorEcef = enuToEcef(
    groundStation,
    getLookVectorEnu(look.azimuthDeg, look.elevationDeg, look.rangeM),
  );
  const relativeUnitVector = scaleVector(relativeVectorEcef, 1 / look.rangeM);

  return {
    positionEciM: addVectors(groundStationEcef, relativeVectorEcef),
    velocityEciMps: scaleVector(relativeUnitVector, rangeRateMps),
    positionEcefM: addVectors(groundStationEcef, relativeVectorEcef),
    velocityEcefMps: scaleVector(relativeUnitVector, rangeRateMps),
  };
}

function createSatelliteFrameAtEciPosition(positionEciM: Cartesian3): SatelliteFrameState {
  return {
    positionEciM,
    velocityEciMps: { x: 0, y: 0, z: 0 },
    positionEcefM: positionEciM,
    velocityEcefMps: { x: 0, y: 0, z: 0 },
  };
}

function getLookVectorEnu(azimuthDeg: number, elevationDeg: number, rangeM: number): Cartesian3 {
  const azimuthRad = (azimuthDeg * Math.PI) / 180;
  const elevationRad = (elevationDeg * Math.PI) / 180;
  const horizontalRangeM = rangeM * Math.cos(elevationRad);

  return {
    x: horizontalRangeM * Math.sin(azimuthRad),
    y: horizontalRangeM * Math.cos(azimuthRad),
    z: rangeM * Math.sin(elevationRad),
  };
}

function enuToEcef(groundStation: GroundStationConfig, vectorEnuM: Cartesian3): Cartesian3 {
  const latRad = (groundStation.latDeg * Math.PI) / 180;
  const lonRad = (groundStation.lonDeg * Math.PI) / 180;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  return {
    x:
      -sinLon * vectorEnuM.x -
      sinLat * cosLon * vectorEnuM.y +
      cosLat * cosLon * vectorEnuM.z,
    y:
      cosLon * vectorEnuM.x -
      sinLat * sinLon * vectorEnuM.y +
      cosLat * sinLon * vectorEnuM.z,
    z: cosLat * vectorEnuM.y + sinLat * vectorEnuM.z,
  };
}

function addVectors(left: Cartesian3, right: Cartesian3): Cartesian3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  };
}

function scaleVector(vector: Cartesian3, scalar: number): Cartesian3 {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
    z: vector.z * scalar,
  };
}
