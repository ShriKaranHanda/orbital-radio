import type {
  Cartesian3,
  GroundStationConfig,
  GroundStationDerivedState,
  PhysicalConstants,
  SatelliteFrameState,
} from "../../state";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const FULL_CIRCLE_DEG = 360;

type Vec3Like = {
  x: number;
  y: number;
  z: number;
};

export type GroundStationPointing = {
  azimuthDeg: number;
  elevationDeg: number;
};

export type GroundStationPointingRatesDegPerSecond = {
  maxAzimuthRateDegPerSecond: number;
  maxElevationRateDegPerSecond: number;
};

export function deriveGroundStationState(
  groundStation: GroundStationConfig,
  physicalConstants: PhysicalConstants,
  satellite: SatelliteFrameState,
  trackedPointing: GroundStationPointing = {
    azimuthDeg: groundStation.antenna.azimuthDeg,
    elevationDeg: groundStation.antenna.elevationDeg,
  },
): GroundStationDerivedState {
  const groundStationEcef = getGroundStationEcef(groundStation, physicalConstants);
  const relativeVector = subtractVectors(
    satellite.positionEcefM,
    groundStationEcef,
  );
  const { eastM, northM, upM } = projectEcefVectorToEnu(relativeVector, groundStation);
  const horizontalRangeM = Math.hypot(eastM, northM);
  const slantRangeM = Math.hypot(horizontalRangeM, upM);
  const azimuthDeg = normalizeDegrees(Math.atan2(eastM, northM) * RAD_TO_DEG);
  const elevationDeg = Math.atan2(upM, horizontalRangeM) * RAD_TO_DEG;
  const horizonMaskElevationDeg = getHorizonMaskElevationDeg(groundStation, azimuthDeg);
  const requiredElevationDeg = Math.max(
    groundStation.minElevationDeg,
    horizonMaskElevationDeg,
  );
  const commandedAzimuthDeg = normalizeDegrees(azimuthDeg);
  const commandedElevationDeg = elevationDeg;
  const trackedAzimuthDeg = normalizeDegrees(trackedPointing.azimuthDeg);
  const trackedElevationDeg = trackedPointing.elevationDeg;

  return {
    azimuthDeg,
    elevationDeg,
    slantRangeM,
    horizonMaskElevationDeg,
    requiredElevationDeg,
    isAboveGeometricHorizon: elevationDeg >= 0,
    clearsOperationalMask: elevationDeg >= requiredElevationDeg,
    commandedAzimuthDeg,
    commandedElevationDeg,
    trackedAzimuthDeg,
    trackedElevationDeg,
    pointingAzimuthErrorDeg: getWrappedAngularDifferenceDeg(
      commandedAzimuthDeg,
      trackedAzimuthDeg,
    ),
    pointingElevationErrorDeg: commandedElevationDeg - trackedElevationDeg,
    pointingSeparationDeg: getAngularSeparationDeg(
      commandedAzimuthDeg,
      commandedElevationDeg,
      trackedAzimuthDeg,
      trackedElevationDeg,
    ),
  };
}

export function getNextGroundStationPointing(
  currentPointing: GroundStationPointing,
  commandedPointing: GroundStationPointing,
  ratesDegPerSecond: GroundStationPointingRatesDegPerSecond,
  timeStepSeconds: number,
  minElevationDeg: number,
): GroundStationPointing {
  const deltaAzimuthDeg = getWrappedAngularDifferenceDeg(
    commandedPointing.azimuthDeg,
    currentPointing.azimuthDeg,
  );
  const deltaElevationDeg = commandedPointing.elevationDeg - currentPointing.elevationDeg;
  const maxAzimuthStepDeg = ratesDegPerSecond.maxAzimuthRateDegPerSecond * timeStepSeconds;
  const maxElevationStepDeg = ratesDegPerSecond.maxElevationRateDegPerSecond * timeStepSeconds;

  return {
    azimuthDeg: normalizeDegrees(
      currentPointing.azimuthDeg +
        clamp(deltaAzimuthDeg, -maxAzimuthStepDeg, maxAzimuthStepDeg),
    ),
    elevationDeg: Math.max(
      minElevationDeg,
      currentPointing.elevationDeg + clamp(
      deltaElevationDeg,
      -maxElevationStepDeg,
      maxElevationStepDeg,
      ),
    ),
  };
}

export function getGroundStationEcef(
  groundStation: GroundStationConfig,
  physicalConstants: PhysicalConstants,
): Cartesian3 {
  const latRad = groundStation.latDeg * DEG_TO_RAD;
  const lonRad = groundStation.lonDeg * DEG_TO_RAD;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);
  const equatorialRadiusM = physicalConstants.earthModel.equatorialRadiusM;
  const flattening = physicalConstants.earthModel.flattening;
  const eccentricitySquared = flattening * (2 - flattening);
  const primeVerticalRadius =
    equatorialRadiusM / Math.sqrt(1 - eccentricitySquared * sinLat * sinLat);

  return {
    x: (primeVerticalRadius + groundStation.altitudeM) * cosLat * cosLon,
    y: (primeVerticalRadius + groundStation.altitudeM) * cosLat * sinLon,
    z:
      (primeVerticalRadius * (1 - eccentricitySquared) + groundStation.altitudeM) *
      sinLat,
  };
}

export function getHorizonMaskElevationDeg(
  groundStation: GroundStationConfig,
  azimuthDeg: number,
) {
  if (groundStation.horizonMask.length === 0) {
    return 0;
  }

  const sortedMask = [...groundStation.horizonMask].sort(
    (left, right) => left.azimuthDeg - right.azimuthDeg,
  );
  const normalizedAzimuthDeg = normalizeDegrees(azimuthDeg);
  const firstIndexAtOrAfter = sortedMask.findIndex(
    (point) => point.azimuthDeg >= normalizedAzimuthDeg,
  );
  const upperIndex = firstIndexAtOrAfter === -1 ? 0 : firstIndexAtOrAfter;
  const lowerIndex = upperIndex === 0 ? sortedMask.length - 1 : upperIndex - 1;
  const lowerPoint = sortedMask[lowerIndex];
  const upperPoint = sortedMask[upperIndex];
  const azimuthSpanDeg = getForwardAzimuthSpanDeg(lowerPoint.azimuthDeg, upperPoint.azimuthDeg);
  const azimuthOffsetDeg = getForwardAzimuthSpanDeg(lowerPoint.azimuthDeg, normalizedAzimuthDeg);

  if (azimuthSpanDeg === 0) {
    return upperPoint.minElevationDeg;
  }

  const ratio = azimuthOffsetDeg / azimuthSpanDeg;
  return (
    lowerPoint.minElevationDeg +
    (upperPoint.minElevationDeg - lowerPoint.minElevationDeg) * ratio
  );
}

export function getGroundStationLocalBasis(groundStation: GroundStationConfig) {
  const latRad = groundStation.latDeg * DEG_TO_RAD;
  const lonRad = groundStation.lonDeg * DEG_TO_RAD;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  return {
    east: {
      x: -sinLon,
      y: 0,
      z: -cosLon,
    },
    north: {
      x: -sinLat * cosLon,
      y: cosLat,
      z: sinLat * sinLon,
    },
    up: {
      x: cosLat * cosLon,
      y: sinLat,
      z: -cosLat * sinLon,
    },
  };
}

export function getGroundStationAntennaDirectionLocalVector(
  groundStation: GroundStationConfig,
  pointing: GroundStationPointing = {
    azimuthDeg: groundStation.antenna.azimuthDeg,
    elevationDeg: groundStation.antenna.elevationDeg,
  },
) {
  const { east, north, up } = getGroundStationLocalBasis(groundStation);
  const azimuthRad = normalizeDegrees(pointing.azimuthDeg) * DEG_TO_RAD;
  const elevationRad = pointing.elevationDeg * DEG_TO_RAD;
  const horizontalScale = Math.cos(elevationRad);
  const eastScale = horizontalScale * Math.sin(azimuthRad);
  const northScale = horizontalScale * Math.cos(azimuthRad);
  const upScale = Math.sin(elevationRad);

  return normalizeVector(
    addVectors(
      addVectors(scaleVector(east, eastScale), scaleVector(north, northScale)),
      scaleVector(up, upScale),
    ),
  );
}

export function getGroundStationElevationArcLocalPositions(
  groundStation: GroundStationConfig,
  stationRadius: number,
  arcRadius = 0.2,
  segments = 24,
  pointing: GroundStationPointing = {
    azimuthDeg: groundStation.antenna.azimuthDeg,
    elevationDeg: groundStation.antenna.elevationDeg,
  },
) {
  const { east, north, up } = getGroundStationLocalBasis(groundStation);
  const azimuthRad = normalizeDegrees(pointing.azimuthDeg) * DEG_TO_RAD;
  const elevationRad = pointing.elevationDeg * DEG_TO_RAD;
  const horizonDirection = normalizeVector(
    addVectors(
      scaleVector(east, Math.sin(azimuthRad)),
      scaleVector(north, Math.cos(azimuthRad)),
    ),
  );
  const stationPosition = scaleVector(up, stationRadius);
  const positions: number[] = [];

  positions.push(stationPosition.x, stationPosition.y, stationPosition.z);

  for (let segmentIndex = 0; segmentIndex <= segments; segmentIndex += 1) {
    const angleRad = (elevationRad * segmentIndex) / segments;
    const arcDirection = normalizeVector(
      addVectors(
        scaleVector(horizonDirection, Math.cos(angleRad)),
        scaleVector(up, Math.sin(angleRad)),
      ),
    );
    const point = addVectors(stationPosition, scaleVector(arcDirection, arcRadius));
    positions.push(point.x, point.y, point.z);
  }

  return positions;
}

function projectEcefVectorToEnu(
  vectorEcefM: Cartesian3,
  groundStation: GroundStationConfig,
) {
  const latRad = groundStation.latDeg * DEG_TO_RAD;
  const lonRad = groundStation.lonDeg * DEG_TO_RAD;
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

export function normalizeDegrees(angleDeg: number) {
  return ((angleDeg % FULL_CIRCLE_DEG) + FULL_CIRCLE_DEG) % FULL_CIRCLE_DEG;
}

function getWrappedAngularDifferenceDeg(targetDeg: number, referenceDeg: number) {
  const differenceDeg = normalizeDegrees(targetDeg - referenceDeg + 180) - 180;
  return differenceDeg === -180 ? 180 : differenceDeg;
}

function getAngularSeparationDeg(
  azimuthADeg: number,
  elevationADeg: number,
  azimuthBDeg: number,
  elevationBDeg: number,
) {
  const azimuthARad = azimuthADeg * DEG_TO_RAD;
  const elevationARad = elevationADeg * DEG_TO_RAD;
  const azimuthBRad = azimuthBDeg * DEG_TO_RAD;
  const elevationBRad = elevationBDeg * DEG_TO_RAD;
  const cosine =
    Math.sin(elevationARad) * Math.sin(elevationBRad) +
    Math.cos(elevationARad) *
      Math.cos(elevationBRad) *
      Math.cos(azimuthARad - azimuthBRad);

  return Math.acos(clamp(cosine, -1, 1)) * RAD_TO_DEG;
}

function getForwardAzimuthSpanDeg(fromAzimuthDeg: number, toAzimuthDeg: number) {
  return normalizeDegrees(toAzimuthDeg - fromAzimuthDeg);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function addVectors(left: Vec3Like, right: Vec3Like): Vec3Like {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  };
}

function scaleVector(vector: Vec3Like, scalar: number): Vec3Like {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
    z: vector.z * scalar,
  };
}

function normalizeVector(vector: Vec3Like): Vec3Like {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}
