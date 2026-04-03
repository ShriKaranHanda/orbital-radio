import type {
  Cartesian3,
  GroundStationConfig,
  PhysicalConstants,
  SimulationClock,
  SimulationFrame,
} from "../../state";

type Vec3Like = {
  x: number;
  y: number;
  z: number;
};

const DEG_TO_RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;

export function getElapsedSeconds(clock: SimulationClock, currentUnixMs: number) {
  return (currentUnixMs - clock.startUnixMs) / 1_000;
}

export function getEarthRotationRad(currentUnixMs: number) {
  const julianDate = currentUnixMs / 86_400_000 + 2_440_587.5;
  const centuriesSinceJ2000 = (julianDate - 2_451_545) / 36_525;
  const gmstDeg =
    280.46061837 +
    360.98564736629 * (julianDate - 2_451_545) +
    0.000387933 * centuriesSinceJ2000 * centuriesSinceJ2000 -
    (centuriesSinceJ2000 * centuriesSinceJ2000 * centuriesSinceJ2000) / 38_710_000;

  return normalizeRadians(gmstDeg * DEG_TO_RAD);
}

export function getCloudRotationRad(currentUnixMs: number) {
  return normalizeRadians(getEarthRotationRad(currentUnixMs) * 1.015);
}

export function getPulseScale(clock: SimulationClock, currentUnixMs: number) {
  const elapsedSeconds = getElapsedSeconds(clock, currentUnixMs);
  return 1 + Math.sin(elapsedSeconds * TWO_PI * 0.7) * 0.18;
}

export function getGroundStationLocalVector(
  groundStation: GroundStationConfig,
  radius = 1,
): Vec3Like {
  const lat = groundStation.latDeg * DEG_TO_RAD;
  const lon = groundStation.lonDeg * DEG_TO_RAD;
  const cosLat = Math.cos(lat);

  return {
    x: cosLat * Math.cos(lon) * radius,
    y: Math.sin(lat) * radius,
    z: -cosLat * Math.sin(lon) * radius,
  };
}

export function getGroundStationWorldVector(
  groundStation: GroundStationConfig,
  currentUnixMs: number,
  radius = 1,
): Vec3Like {
  return rotateAroundY(
    getGroundStationLocalVector(groundStation, radius),
    getEarthRotationRad(currentUnixMs),
  );
}

export function getSatelliteLocalVector(
  frame: SimulationFrame,
  physicalConstants: PhysicalConstants,
  radius = 1,
): Vec3Like {
  return scaleMetersVectorToScene(
    frame.satellite.positionEcefM,
    physicalConstants.earthModel.meanRadiusM,
    radius,
  );
}

export function getSatelliteInertialLocalVector(
  frame: SimulationFrame,
  physicalConstants: PhysicalConstants,
  radius = 1,
): Vec3Like {
  return scaleMetersVectorToScene(
    frame.satellite.positionEciM,
    physicalConstants.earthModel.meanRadiusM,
    radius,
  );
}

export function getSatellitePathLocalPositions(
  frames: readonly SimulationFrame[],
  physicalConstants: PhysicalConstants,
  radius = 1,
) {
  return frames.flatMap((frame) => {
    const position = getSatelliteInertialLocalVector(frame, physicalConstants, radius);
    return [position.x, position.y, position.z];
  });
}

function rotateAroundY(vector: Vec3Like, angleRad: number): Vec3Like {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  return {
    x: vector.x * cos + vector.z * sin,
    y: vector.y,
    z: -vector.x * sin + vector.z * cos,
  };
}

function normalizeRadians(angleRad: number) {
  return ((angleRad % TWO_PI) + TWO_PI) % TWO_PI;
}

function scaleMetersVectorToScene(
  vectorMeters: Cartesian3,
  earthMeanRadiusM: number,
  radius: number,
): Vec3Like {
  const scale = radius / earthMeanRadiusM;

  return {
    x: vectorMeters.x * scale,
    y: vectorMeters.y * scale,
    z: vectorMeters.z * scale,
  };
}
