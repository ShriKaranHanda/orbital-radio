import {
  json2satrec,
} from "../../node_modules/satellite.js/dist/io.js";
import { propagate } from "../../node_modules/satellite.js/dist/propagation.js";
import { gstime } from "../../node_modules/satellite.js/dist/propagation/gstime.js";
import { eciToEcf } from "../../node_modules/satellite.js/dist/transforms.js";
import type { OMMJsonObject } from "../../node_modules/satellite.js/dist/common-types.js";
import type { SatRec } from "../../node_modules/satellite.js/dist/propagation/SatRec.js";
import type { Cartesian3, SatelliteFrameState, TleElements } from "../../state";

const METERS_PER_KILOMETER = 1_000;
const EARTH_ROTATION_RAD_PER_SECOND = 7.2921150e-5;

export function buildSatelliteRecord(tle: TleElements) {
  return json2satrec(buildTleOmm(tle));
}

export function propagateSatelliteFrame(
  satelliteRecord: SatRec,
  currentUnixMs: number,
): SatelliteFrameState {
  const date = new Date(currentUnixMs);
  const propagatedState = propagate(satelliteRecord, date);
  const { position, velocity } = propagatedState;

  if (!position || !velocity) {
    throw new Error(`Failed to propagate satellite state at ${date.toISOString()}.`);
  }

  const gmst = gstime(date);
  const positionEcefKm = eciToEcf(position, gmst);
  const velocityEcefKmps = rotateVelocityIntoEcef(position, velocity, gmst);

  return {
    positionEciM: kilometersToMeters(position),
    velocityEciMps: kilometersToMeters(velocity),
    positionEcefM: kilometersToMeters(positionEcefKm),
    velocityEcefMps: kilometersToMeters(velocityEcefKmps),
  };
}

function buildTleOmm(tle: TleElements): OMMJsonObject {
  const classificationType =
    tle.classification === "U" || tle.classification === "C"
      ? tle.classification
      : undefined;
  const ephemerisType = tle.ephemerisType === 0 ? 0 : undefined;

  return {
    OBJECT_NAME: tle.name,
    OBJECT_ID: formatInternationalDesignator(tle),
    EPOCH: tleEpochToDate(tle.epoch).toISOString(),
    MEAN_MOTION: tle.meanMotionRevsPerDay,
    ECCENTRICITY: tle.eccentricity,
    INCLINATION: tle.inclinationDeg,
    RA_OF_ASC_NODE: tle.rightAscensionAscendingNodeDeg,
    ARG_OF_PERICENTER: tle.argumentOfPerigeeDeg,
    MEAN_ANOMALY: tle.meanAnomalyDeg,
    NORAD_CAT_ID: tle.satelliteCatalogNumber,
    ELEMENT_SET_NO: tle.elementSetNumber,
    REV_AT_EPOCH: tle.revolutionNumberAtEpoch,
    BSTAR: tle.bstarDragTerm,
    MEAN_MOTION_DOT: tle.meanMotionFirstDerivative,
    MEAN_MOTION_DDOT: tle.meanMotionSecondDerivative,
    ...(classificationType ? { CLASSIFICATION_TYPE: classificationType } : {}),
    ...(ephemerisType !== undefined ? { EPHEMERIS_TYPE: ephemerisType } : {}),
  };
}

function rotateVelocityIntoEcef(
  positionEciKm: Cartesian3,
  velocityEciKmps: Cartesian3,
  gmst: number,
): Cartesian3 {
  const positionEcefKm = eciToEcf(positionEciKm, gmst);
  const rotatedVelocityKmps = eciToEcf(velocityEciKmps, gmst);

  return {
    x: rotatedVelocityKmps.x + EARTH_ROTATION_RAD_PER_SECOND * positionEcefKm.y,
    y: rotatedVelocityKmps.y - EARTH_ROTATION_RAD_PER_SECOND * positionEcefKm.x,
    z: rotatedVelocityKmps.z,
  };
}

function kilometersToMeters(vectorKm: Cartesian3): Cartesian3 {
  return {
    x: vectorKm.x * METERS_PER_KILOMETER,
    y: vectorKm.y * METERS_PER_KILOMETER,
    z: vectorKm.z * METERS_PER_KILOMETER,
  };
}

function formatInternationalDesignator(tle: TleElements) {
  const { launchYear, launchNumberOfYear, launchPiece } = tle.internationalDesignator;
  return `${launchYear}-${String(launchNumberOfYear).padStart(3, "0")}${launchPiece}`;
}

function tleEpochToDate(epoch: TleElements["epoch"]) {
  const dayStartUnixMs = Date.UTC(epoch.year, 0, epoch.dayOfYear);
  const fractionalDayMs = epoch.fractionalDay * 86_400_000;

  return new Date(dayStartUnixMs + fractionalDayMs);
}
