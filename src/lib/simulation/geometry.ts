import {
  getGroundStationEcef,
  getHorizonMaskElevationDeg,
  normalizeDegrees,
} from "../ground-station";
import type {
  Cartesian3,
  GroundStationConfig,
  GroundStationGeometryState,
  GroundStationPassWindowMetadata,
  PhysicalConstants,
  RadioLinkConfig,
  SatelliteFrameState,
} from "../../../state";

const RAD_TO_DEG = 180 / Math.PI;

type RadioConfig = {
  downlink: RadioLinkConfig;
  uplink: RadioLinkConfig;
};

type PassWindowFrameInput = {
  index: number;
  elevationDeg: number;
  clearsOperationalMask: boolean;
};

type GroundStationGeometryCoreState = Omit<
  GroundStationGeometryState,
  keyof GroundStationPassWindowMetadata
>;

export function deriveGroundStationGeometryState(
  groundStation: GroundStationConfig,
  radio: RadioConfig,
  physicalConstants: PhysicalConstants,
  satellite: SatelliteFrameState,
): GroundStationGeometryCoreState {
  const groundStationEcef = getGroundStationEcef(groundStation, physicalConstants);
  const relativeVectorEcefM = subtractVectors(
    satellite.positionEcefM,
    groundStationEcef,
  );
  const { eastM, northM, upM } = projectEcefVectorToEnu(
    relativeVectorEcefM,
    groundStation,
  );
  const horizontalRangeM = Math.hypot(eastM, northM);
  const slantRangeM = Math.hypot(horizontalRangeM, upM);
  const azimuthDeg = normalizeDegrees(Math.atan2(eastM, northM) * RAD_TO_DEG);
  const elevationDeg = Math.atan2(upM, horizontalRangeM) * RAD_TO_DEG;
  const horizonMaskElevationDeg = getHorizonMaskElevationDeg(groundStation, azimuthDeg);
  const requiredElevationDeg = Math.max(
    groundStation.minElevationDeg,
    horizonMaskElevationDeg,
  );
  const rangeRateMps =
    slantRangeM === 0
      ? 0
      : dotProduct(relativeVectorEcefM, satellite.velocityEcefMps) / slantRangeM;
  const downlinkDopplerShiftHz = getDopplerShiftHz(
    rangeRateMps,
    radio.downlink.carrierHz,
    physicalConstants.speedOfLightMps,
  );
  const uplinkDopplerShiftHz = getDopplerShiftHz(
    rangeRateMps,
    radio.uplink.carrierHz,
    physicalConstants.speedOfLightMps,
  );

  return {
    azimuthDeg,
    elevationDeg,
    slantRangeM,
    rangeRateMps,
    downlinkDopplerShiftHz,
    uplinkDopplerShiftHz,
    horizonMaskElevationDeg,
    requiredElevationDeg,
    isAboveGeometricHorizon: elevationDeg >= 0,
    clearsOperationalMask: elevationDeg >= requiredElevationDeg,
  };
}

export function derivePassWindowMetadata(
  frames: readonly PassWindowFrameInput[],
  stepSeconds: number,
): Omit<GroundStationPassWindowMetadata, "inPass"> {
  const visibleFrames = frames.filter((frame) => frame.clearsOperationalMask);

  if (visibleFrames.length === 0) {
    return {
      kIn: null,
      kApex: null,
      kOut: null,
      passDurationSeconds: 0,
    };
  }

  const kIn = visibleFrames[0].index;
  const kOut = visibleFrames[visibleFrames.length - 1].index;
  const kApex = visibleFrames.reduce((bestFrame, currentFrame) =>
    currentFrame.elevationDeg > bestFrame.elevationDeg ? currentFrame : bestFrame,
  ).index;

  return {
    kIn,
    kApex,
    kOut,
    passDurationSeconds: (kOut - kIn + 1) * stepSeconds,
  };
}

export function isFrameInPass(
  frameIndex: number,
  passWindow: Omit<GroundStationPassWindowMetadata, "inPass">,
) {
  return (
    passWindow.kIn !== null &&
    passWindow.kOut !== null &&
    frameIndex >= passWindow.kIn &&
    frameIndex <= passWindow.kOut
  );
}

function getDopplerShiftHz(
  rangeRateMps: number,
  carrierHz: number,
  speedOfLightMps: number,
) {
  return -(rangeRateMps / speedOfLightMps) * carrierHz;
}

function projectEcefVectorToEnu(
  vectorEcefM: Cartesian3,
  groundStation: GroundStationConfig,
) {
  const latRad = (groundStation.latDeg * Math.PI) / 180;
  const lonRad = (groundStation.lonDeg * Math.PI) / 180;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  return {
    eastM: -sinLon * vectorEcefM.x + cosLon * vectorEcefM.y,
    northM:
      -sinLat * cosLon * vectorEcefM.x -
      sinLat * sinLon * vectorEcefM.y +
      cosLat * vectorEcefM.z,
    upM:
      cosLat * cosLon * vectorEcefM.x +
      cosLat * sinLon * vectorEcefM.y +
      sinLat * vectorEcefM.z,
  };
}

function subtractVectors(minuend: Cartesian3, subtrahend: Cartesian3): Cartesian3 {
  return {
    x: minuend.x - subtrahend.x,
    y: minuend.y - subtrahend.y,
    z: minuend.z - subtrahend.z,
  };
}

function dotProduct(left: Cartesian3, right: Cartesian3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}
