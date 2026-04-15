import {
  deriveGroundStationPointingState,
  getNextGroundStationPointing,
  normalizeDegrees,
  type GroundStationPointing,
  type GroundStationPointingRatesDegPerSecond,
} from "../ground-station";
import { buildSatelliteRecord, propagateSatelliteFrame } from "../orbit";
import {
  deriveGroundStationGeometryState,
  derivePassWindowMetadata,
  isFrameInPass,
} from "./geometry";
import { buildHardwareStates } from "./hardware";
import { deriveLinkState } from "./link";
import { deriveSunState } from "./sun";
import type {
  HardwareNominalConstants,
  PhysicalConstants,
  SimulationClock,
  SimulationConfig,
  SimulationFrame,
} from "../../../state";

export function buildSimulationFrames(
  config: Pick<
    SimulationConfig,
    "tle" | "groundStation" | "radio" | "traffic" | "scenario"
  >,
  clock: SimulationClock,
  physicalConstants: PhysicalConstants,
  steeringLimits: GroundStationPointingRatesDegPerSecond,
  nominalConstants: HardwareNominalConstants,
): SimulationFrame[] {
  if (clock.stepSeconds <= 0) {
    throw new Error("Simulation clock stepSeconds must be greater than zero.");
  }

  if (clock.endUnixMs < clock.startUnixMs) {
    throw new Error("Simulation clock endUnixMs must be >= startUnixMs.");
  }

  const stepMs = clock.stepSeconds * 1_000;
  const satelliteRecord = buildSatelliteRecord(config.tle);
  const propagatedFrames: Array<Pick<SimulationFrame, "index" | "currentUnixMs" | "satellite">> =
    [];

  for (
    let currentUnixMs = clock.startUnixMs, index = 0;
    currentUnixMs <= clock.endUnixMs;
    currentUnixMs += stepMs, index += 1
  ) {
    propagatedFrames.push({
      index,
      currentUnixMs,
      satellite: propagateSatelliteFrame(satelliteRecord, currentUnixMs),
    });
  }

  const geometryFrames = propagatedFrames.map((frame) => ({
    ...frame,
    sun: deriveSunState(frame.currentUnixMs, frame.satellite, physicalConstants),
    geometry: deriveGroundStationGeometryState(
      config.groundStation,
      config.radio,
      physicalConstants,
      frame.satellite,
    ),
  }));
  const passWindow = derivePassWindowMetadata(
    geometryFrames.map((frame) => ({
      index: frame.index,
      elevationDeg: frame.geometry.elevationDeg,
      clearsOperationalMask: frame.geometry.clearsOperationalMask,
    })),
    clock.stepSeconds,
  );

  let groundStationPointing: GroundStationPointing = {
    azimuthDeg: normalizeDegrees(config.groundStation.antenna.azimuthDeg),
    elevationDeg: config.groundStation.antenna.elevationDeg,
  };

  const framesWithoutHardware = geometryFrames.map((frame) => {
    const groundStation = {
      ...frame.geometry,
      ...passWindow,
      inPass: isFrameInPass(frame.index, passWindow),
      ...deriveGroundStationPointingState(
        {
          azimuthDeg: frame.geometry.azimuthDeg,
          elevationDeg: frame.geometry.elevationDeg,
        },
        groundStationPointing,
      ),
    };

    groundStationPointing = getNextGroundStationPointing(
      groundStationPointing,
      {
        azimuthDeg: groundStation.commandedAzimuthDeg,
        elevationDeg: groundStation.commandedElevationDeg,
      },
      steeringLimits,
      clock.stepSeconds,
      config.groundStation.minElevationDeg,
    );

    return {
      index: frame.index,
      currentUnixMs: frame.currentUnixMs,
      satellite: frame.satellite,
      groundStation,
      sun: frame.sun,
    };
  });

  const hardwareStates = buildHardwareStates(
    framesWithoutHardware,
    config,
    clock,
    physicalConstants,
    nominalConstants,
  );

  return framesWithoutHardware.map((frame, index) => {
    const hardware = hardwareStates[index];

    return {
      ...frame,
      hardware,
      link: deriveLinkState(config, physicalConstants, frame.groundStation, hardware),
    };
  });
}
