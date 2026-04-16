import { eciToEcf, gstime } from "../satellite";
import type {
  Cartesian3,
  PhysicalConstants,
  SatelliteFrameState,
  SunDerivedState,
} from "../../../state";

const DEG_TO_RAD = Math.PI / 180;
const JULIAN_DATE_AT_UNIX_EPOCH = 2_440_587.5;
const JULIAN_DATE_AT_J2000 = 2_451_545.0;
const DAYS_PER_JULIAN_CENTURY = 36_525;
const SOLAR_FLUX_AT_1_AU_W_PER_M2 = 1_361;
const ASTRONOMICAL_UNIT_M = 149_597_870_700;
const SUN_RADIUS_M = 695_700_000;

export type SunEphemeris = {
  directionEciUnit: Cartesian3;
  earthSunDistanceAu: number;
  solarFluxWPerM2: number;
};

export function deriveSunState(
  currentUnixMs: number,
  satellite: SatelliteFrameState,
  physicalConstants: PhysicalConstants,
): SunDerivedState {
  const ephemeris = getSunEphemeris(currentUnixMs);
  const date = new Date(currentUnixMs);
  const gmst = gstime(date);

  return {
    directionEciUnit: ephemeris.directionEciUnit,
    directionEcefUnit: eciToEcf(ephemeris.directionEciUnit, gmst),
    solarFluxWPerM2: ephemeris.solarFluxWPerM2,
    sunExposureFactor: getSunExposureFactor(
      satellite.positionEciM,
      ephemeris.directionEciUnit,
      ephemeris.earthSunDistanceAu,
      physicalConstants.earthModel.meanRadiusM,
    ),
  };
}

export function getSunEphemeris(currentUnixMs: number): SunEphemeris {
  const julianDate = currentUnixMs / 86_400_000 + JULIAN_DATE_AT_UNIX_EPOCH;
  const julianCenturies =
    (julianDate - JULIAN_DATE_AT_J2000) / DAYS_PER_JULIAN_CENTURY;
  const meanLongitudeRad =
    normalizeDegrees(280.46 + 36_000.771 * julianCenturies) * DEG_TO_RAD;
  const meanAnomalyRad =
    normalizeDegrees(357.528 + 35_999.05 * julianCenturies) * DEG_TO_RAD;
  const eclipticLongitudeRad =
    meanLongitudeRad +
    1.915 * DEG_TO_RAD * Math.sin(meanAnomalyRad) +
    0.02 * DEG_TO_RAD * Math.sin(2 * meanAnomalyRad);
  const obliquityRad =
    (23.4393 - 0.013 * julianCenturies) * DEG_TO_RAD;
  const earthSunDistanceAu =
    1.00014 -
    0.01671 * Math.cos(meanAnomalyRad) -
    0.00014 * Math.cos(2 * meanAnomalyRad);

  return {
    directionEciUnit: {
      x: Math.cos(eclipticLongitudeRad),
      y: Math.cos(obliquityRad) * Math.sin(eclipticLongitudeRad),
      z: Math.sin(obliquityRad) * Math.sin(eclipticLongitudeRad),
    },
    earthSunDistanceAu,
    solarFluxWPerM2:
      SOLAR_FLUX_AT_1_AU_W_PER_M2 / (earthSunDistanceAu * earthSunDistanceAu),
  };
}

function getSunExposureFactor(
  satellitePositionEciM: Cartesian3,
  sunDirectionEciUnit: Cartesian3,
  earthSunDistanceAu: number,
  earthRadiusM: number,
) {
  const satelliteRadiusM = magnitude(satellitePositionEciM);
  const satelliteToEarthDirection = scaleVector(
    satellitePositionEciM,
    -1 / satelliteRadiusM,
  );
  const satelliteToSunVector = subtractVectors(
    scaleVector(sunDirectionEciUnit, earthSunDistanceAu * ASTRONOMICAL_UNIT_M),
    satellitePositionEciM,
  );
  const satelliteToSunDistanceM = magnitude(satelliteToSunVector);
  const satelliteToSunDirection = scaleVector(
    satelliteToSunVector,
    1 / satelliteToSunDistanceM,
  );
  const angularSeparationRad = Math.acos(
    clamp(dotProduct(satelliteToEarthDirection, satelliteToSunDirection), -1, 1),
  );
  const earthAngularRadiusRad = Math.asin(
    clamp(earthRadiusM / satelliteRadiusM, -1, 1),
  );
  const sunAngularRadiusRad = Math.asin(
    clamp(SUN_RADIUS_M / satelliteToSunDistanceM, -1, 1),
  );

  // First-order penumbra model: 0 in umbra, 1 in full sun, linear across the penumbra.
  return clamp(
    (angularSeparationRad - (earthAngularRadiusRad - sunAngularRadiusRad)) /
      (2 * sunAngularRadiusRad),
    0,
    1,
  );
}

function normalizeDegrees(angleDeg: number) {
  return ((angleDeg % 360) + 360) % 360;
}

function subtractVectors(minuend: Cartesian3, subtrahend: Cartesian3): Cartesian3 {
  return {
    x: minuend.x - subtrahend.x,
    y: minuend.y - subtrahend.y,
    z: minuend.z - subtrahend.z,
  };
}

function scaleVector(vector: Cartesian3, scalar: number): Cartesian3 {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
    z: vector.z * scalar,
  };
}

function dotProduct(left: Cartesian3, right: Cartesian3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function magnitude(vector: Cartesian3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
