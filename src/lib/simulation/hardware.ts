import { getGroundStationEcef } from "../ground-station";
import type {
  ActiveFaultState,
  FaultConfig,
  FaultEffects,
  GroundStationConfig,
  GroundStationDerivedState,
  HardwareNominalConstants,
  HardwareReasonState,
  PhysicalConstants,
  SatelliteFrameState,
  SimulationClock,
  SimulationConfig,
  SimulationHardwareState,
} from "../../../state";
import {
  getOfferedPacketRatePacketsPerSecond,
  resolveTrafficDirectionConfig,
} from "./traffic-config";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MILLISECONDS_PER_DAY = 86_400_000;
const JULIAN_DATE_AT_UNIX_EPOCH = 2_440_587.5;
const KELVIN_TO_CELSIUS_OFFSET = 273.15;
const GROUND_STATION_BEAMWIDTH_DEG = 0.7;
const SOLAR_FLUX_W_PER_M2 = 1_361;
const REASON_TAGS = [
  "array_scan_loss",
  "field_of_regard",
  "freq_error",
  "pa_backoff",
  "thermal_throttle",
  "compute_overload",
  "power_limited",
] as const;

type ReasonTag = (typeof REASON_TAGS)[number];

type FrameInput = {
  index: number;
  currentUnixMs: number;
  satellite: SatelliteFrameState;
  groundStation: GroundStationDerivedState;
};

type HardwareModelConstants = {
  targetDownlinkEirpDbw: number;
  fieldOfRegardDeg: number;
  array: {
    elementGainDbi: number;
    scanLossExponent: number;
    phaseLsbRad: number;
    thermalPhaseStdRadAtRef: number;
    thermalPhaseStdRadPerK: number;
    thermalLossDbPerK: number;
    txCalibrationLossDb: number;
    rxCalibrationLossDb: number;
    elementSpacingM: number;
    beamwidthFactor: number;
    fieldOfRegardPenaltyDb: number;
    fieldOfRegardPenaltySlopeDbPerDeg2: number;
  };
  rf: {
    referenceTempK: number;
    noiseFigureTempCoefficientDbPerK: number;
    filterLossDb: number;
    conversionLossDb: number;
    implementationLossDb: number;
    satelliteRxNoiseFigureOffsetDb: number;
  };
  powerAmplifier: {
    saturationReferenceDbw: number;
    compressionCoefficient: number;
    efficiencyNominal: number;
    efficiencyMin: number;
    efficiencyMax: number;
    efficiencyTempCoefficientPerK: number;
    referenceTempK: number;
    derateStartTempK: number;
    derateDbPerK: number;
  };
  oscillator: {
    referenceTempK: number;
    baseOffsetHz: number;
    thermalSensitivityHzPerK: number;
    driftHzPerSecond: number;
    timingJitterBaseSeconds: number;
    timingJitterPerK: number;
    timingJitterMaxSeconds: number;
  };
  thermal: {
    sinkTempK: number;
    array: ThermalBranchConstants;
    pa: ThermalBranchConstants;
    rf: ThermalBranchConstants;
    oscillator: ThermalBranchConstants;
    rfCpuHeatCoefficientW: number;
    thermalControlTargetTempK: number;
    thermalControlPowerPerK: number;
  };
  power: {
    solarAreaM2: number;
    solarEfficiency: number;
    batteryMaxEnergyJ: number;
    initialBatterySoc: number;
    batteryMaxDischargeW: number;
    minSocForBatteryAssist: number;
    busPenaltyDbPerUnit: number;
    housePowerW: number;
  };
  compute: {
    capacityUnitsPerSecond: number;
    idleDemandUnits: number;
    beamDemandPerElement: number;
    dopplerDemandUnits: number;
    modemDemandPerByte: number;
    telemetryDemandPerFault: number;
    idlePowerW: number;
    maxPowerW: number;
  };
  groundStation: {
    txPowerNominalDbw: number;
    txPowerMinDbw: number;
    txPowerMaxDbw: number;
    txRfLossDb: number;
    rxNoiseFigureNominalDb: number;
    txPowerSigmaDb: number;
    gainSigmaDb: number;
    noiseFigureSigmaDb: number;
    referenceSigmaHz: number;
    evmSigmaRms: number;
  };
  reason: {
    downlinkFrequencyToleranceHz: number;
    uplinkFrequencyToleranceHz: number;
    compressionTagDb: number;
    arrayTagDb: number;
    temperatureThresholdK: number;
    temperatureTagSpanK: number;
    scheduleDeadlineSeconds: number;
  };
};

type ThermalBranchConstants = {
  capacitanceJPerK: number;
  resistanceKPerW: number;
  sunAbsorptivity: number;
  areaM2: number;
  baseHeatW: number;
  scanHeatCoefficientWPerDeg2?: number;
};

type DynamicHardwareState = {
  arrayTempK: number;
  paTempK: number;
  rfTempK: number;
  oscillatorTempK: number;
  batteryEnergyJ: number;
  computeBacklogUnits: number;
};

type GroundStationPerturbations = {
  txPowerOffsetDb: number;
  rxGainOffsetDb: number;
  txGainOffsetDb: number;
  rxNoiseFigureOffsetDb: number;
  referenceOffsetHz: number;
  txEvmRms: number;
};

type FaultAggregate = FaultEffects;

const DEFAULT_FAULT_EFFECTS: FaultEffects = {
  degradedElementFraction: 0,
  arrayThermalLossDb: 0,
  rfLossDb: 0,
  noiseFigureDb: 0,
  paPowerLimitDb: 0,
  paEfficiencyPenalty: 0,
  oscillatorOffsetHz: 0,
  oscillatorJitterSeconds: 0,
  busPenaltyDb: 0,
  computeLoadUnits: 0,
  thermalLoadW: 0,
};

const HARDWARE_MODEL_CONSTANTS: HardwareModelConstants = {
  targetDownlinkEirpDbw: 39.2,
  fieldOfRegardDeg: 65,
  array: {
    elementGainDbi: 6.2,
    scanLossExponent: 1.35,
    phaseLsbRad: (5.625 * Math.PI) / 180,
    thermalPhaseStdRadAtRef: 0.035,
    thermalPhaseStdRadPerK: 0.0018,
    thermalLossDbPerK: 0.025,
    txCalibrationLossDb: 0.2,
    rxCalibrationLossDb: 0.35,
    elementSpacingM: 0.5 * (299_792_458 / 18_200_000_000),
    beamwidthFactor: 0.886,
    fieldOfRegardPenaltyDb: 20,
    fieldOfRegardPenaltySlopeDbPerDeg2: 0.55,
  },
  rf: {
    referenceTempK: 295,
    noiseFigureTempCoefficientDbPerK: 0.015,
    filterLossDb: 0.6,
    conversionLossDb: 0.8,
    implementationLossDb: 0.45,
    satelliteRxNoiseFigureOffsetDb: 0.25,
  },
  powerAmplifier: {
    saturationReferenceDbw: 8,
    compressionCoefficient: 0.05,
    efficiencyNominal: 0.33,
    efficiencyMin: 0.14,
    efficiencyMax: 0.42,
    efficiencyTempCoefficientPerK: 0.0012,
    referenceTempK: 296,
    derateStartTempK: 352,
    derateDbPerK: 0.055,
  },
  oscillator: {
    referenceTempK: 295,
    baseOffsetHz: 250,
    thermalSensitivityHzPerK: 35,
    driftHzPerSecond: 0.85,
    timingJitterBaseSeconds: 6e-12,
    timingJitterPerK: 1.2e-13,
    timingJitterMaxSeconds: 1.2e-10,
  },
  thermal: {
    sinkTempK: 287,
    array: {
      capacitanceJPerK: 24_000,
      resistanceKPerW: 0.85,
      sunAbsorptivity: 0.68,
      areaM2: 1.25,
      baseHeatW: 42,
      scanHeatCoefficientWPerDeg2: 0.06,
    },
    pa: {
      capacitanceJPerK: 14_000,
      resistanceKPerW: 0.62,
      sunAbsorptivity: 0.42,
      areaM2: 0.42,
      baseHeatW: 0,
    },
    rf: {
      capacitanceJPerK: 18_000,
      resistanceKPerW: 0.95,
      sunAbsorptivity: 0.38,
      areaM2: 0.55,
      baseHeatW: 18,
    },
    oscillator: {
      capacitanceJPerK: 9_000,
      resistanceKPerW: 1.25,
      sunAbsorptivity: 0.24,
      areaM2: 0.18,
      baseHeatW: 6,
    },
    rfCpuHeatCoefficientW: 24,
    thermalControlTargetTempK: 318,
    thermalControlPowerPerK: 2.4,
  },
  power: {
    solarAreaM2: 6.2,
    solarEfficiency: 0.28,
    batteryMaxEnergyJ: 8_000_000,
    initialBatterySoc: 0.74,
    batteryMaxDischargeW: 1_250,
    minSocForBatteryAssist: 0.18,
    busPenaltyDbPerUnit: 4.5,
    housePowerW: 110,
  },
  compute: {
    capacityUnitsPerSecond: 95_000,
    idleDemandUnits: 18_000,
    beamDemandPerElement: 58,
    dopplerDemandUnits: 3_500,
    modemDemandPerByte: 0.0006,
    telemetryDemandPerFault: 3_200,
    idlePowerW: 45,
    maxPowerW: 135,
  },
  groundStation: {
    txPowerNominalDbw: 8.5,
    txPowerMinDbw: 4.5,
    txPowerMaxDbw: 11.5,
    txRfLossDb: 1.1,
    rxNoiseFigureNominalDb: 1.6,
    txPowerSigmaDb: 0.35,
    gainSigmaDb: 0.22,
    noiseFigureSigmaDb: 0.18,
    referenceSigmaHz: 900,
    evmSigmaRms: 0.015,
  },
  reason: {
    downlinkFrequencyToleranceHz: 15_000,
    uplinkFrequencyToleranceHz: 20_000,
    compressionTagDb: 0.6,
    arrayTagDb: 4.0,
    temperatureThresholdK: 335,
    temperatureTagSpanK: 18,
    scheduleDeadlineSeconds: 0.18,
  },
};

export function buildHardwareStates(
  frames: readonly FrameInput[],
  config: Pick<SimulationConfig, "groundStation" | "radio" | "traffic" | "scenario">,
  clock: SimulationClock,
  physicalConstants: PhysicalConstants,
  nominalConstants: HardwareNominalConstants,
): SimulationHardwareState[] {
  const groundStationEcef = getGroundStationEcef(config.groundStation, physicalConstants);
  const downlinkTraffic = resolveTrafficDirectionConfig(config.traffic, "downlink");
  const uplinkTraffic = resolveTrafficDirectionConfig(config.traffic, "uplink");
  const offeredPayloadBytesPerSecond =
    getOfferedPacketRatePacketsPerSecond(downlinkTraffic) *
      downlinkTraffic.packetSizeBytes +
    getOfferedPacketRatePacketsPerSecond(uplinkTraffic) *
      uplinkTraffic.packetSizeBytes;
  let dynamicState = getInitialDynamicHardwareState(HARDWARE_MODEL_CONSTANTS);

  return frames.map((frame) => {
    const elapsedSeconds = (frame.currentUnixMs - clock.startUnixMs) / 1_000;
    const activeFaults = getActiveFaults(config.scenario.enabledFaults, elapsedSeconds);
    const faultAggregate = aggregateFaultEffects(activeFaults);
    const steering = deriveSteeringState(
      frame.satellite,
      frame.groundStation,
      groundStationEcef,
      HARDWARE_MODEL_CONSTANTS,
    );
    const groundPerturbations = getGroundStationPerturbations(
      config.scenario.seed,
      frame.index,
      HARDWARE_MODEL_CONSTANTS,
    );
    const groundTerminal = deriveGroundTerminalState(
      config.groundStation,
      frame.groundStation,
      groundPerturbations,
      HARDWARE_MODEL_CONSTANTS,
    );
    const phasedArray = derivePhasedArrayState(
      dynamicState,
      steering,
      faultAggregate,
      nominalConstants,
      config.radio.downlink.carrierHz,
      HARDWARE_MODEL_CONSTANTS,
    );
    const compute = deriveComputeState(
      dynamicState.computeBacklogUnits,
      activeFaults.length,
      phasedArray.activeElementCount,
      steering.linkEnabled,
      offeredPayloadBytesPerSecond,
      HARDWARE_MODEL_CONSTANTS,
      faultAggregate,
    );
    const oscillator = deriveOscillatorState(
      dynamicState,
      elapsedSeconds,
      frame.index,
      frame.groundStation,
      frames,
      compute.scheduleDelaySeconds,
      groundTerminal.referenceOffsetHz,
      faultAggregate,
      HARDWARE_MODEL_CONSTANTS,
      clock.stepSeconds,
    );
    const sunExposure = getSunExposure(frame.currentUnixMs, frame.satellite);
    const thermalControlPowerW = getThermalControlPower(dynamicState, HARDWARE_MODEL_CONSTANTS);
    const powerAmplifier = solvePowerAmplifierState(
      dynamicState,
      steering.linkEnabled,
      phasedArray.arrayGainDbi,
      faultAggregate,
      compute.powerDrawW,
      sunExposure,
      thermalControlPowerW,
      nominalConstants,
      HARDWARE_MODEL_CONSTANTS,
    );
    const solarGenerationW = getSolarGenerationW(sunExposure, HARDWARE_MODEL_CONSTANTS);
    const powerBus = derivePowerBusState(
      dynamicState.batteryEnergyJ,
      powerAmplifier.dcDrawW,
      compute.powerDrawW,
      thermalControlPowerW,
      solarGenerationW,
      HARDWARE_MODEL_CONSTANTS,
    );
    const rfFrontEnd = deriveRfFrontEndState(
      dynamicState,
      faultAggregate,
      nominalConstants,
      HARDWARE_MODEL_CONSTANTS,
    );
    const thermal = deriveThermalState(
      dynamicState,
      sunExposure,
      solarGenerationW,
      thermalControlPowerW,
    );
    const reason = deriveReasonState(
      steering,
      phasedArray,
      powerAmplifier,
      oscillator,
      dynamicState,
      powerBus,
      compute,
      HARDWARE_MODEL_CONSTANTS,
    );

    const hardwareState: SimulationHardwareState = {
      activeFaults,
      steering,
      groundTerminal,
      phasedArray,
      rfFrontEnd,
      powerAmplifier,
      oscillator,
      thermal,
      powerBus,
      compute,
      reason,
    };

    dynamicState = advanceDynamicState(
      dynamicState,
      steering,
      powerAmplifier,
      compute,
      thermal,
      powerBus,
      clock.stepSeconds,
      faultAggregate,
      HARDWARE_MODEL_CONSTANTS,
    );

    return hardwareState;
  });
}

function getInitialDynamicHardwareState(
  constants: HardwareModelConstants,
): DynamicHardwareState {
  return {
    arrayTempK: 294,
    paTempK: 296,
    rfTempK: 295,
    oscillatorTempK: 294,
    batteryEnergyJ: constants.power.batteryMaxEnergyJ * constants.power.initialBatterySoc,
    computeBacklogUnits: 0,
  };
}

function getActiveFaults(
  configuredFaults: readonly FaultConfig[],
  elapsedSeconds: number,
): ActiveFaultState[] {
  return configuredFaults.flatMap((fault) => {
    const startSeconds = fault.startOffsetSeconds;
    const endSeconds = startSeconds + fault.durationSeconds;

    if (elapsedSeconds < startSeconds || elapsedSeconds >= endSeconds) {
      return [];
    }

    const severity = fault.severity ?? 1;
    return [
      {
        id: fault.id,
        label: fault.label,
        kind: fault.kind ?? "custom",
        severity,
        effects: mergeFaultEffects(
          getDefaultFaultEffects(fault.kind, severity),
          fault.effects,
        ),
      },
    ];
  });
}

function aggregateFaultEffects(activeFaults: readonly ActiveFaultState[]): FaultAggregate {
  return activeFaults.reduce<FaultAggregate>(
    (aggregate, fault) => ({
      degradedElementFraction:
        aggregate.degradedElementFraction + fault.effects.degradedElementFraction,
      arrayThermalLossDb: aggregate.arrayThermalLossDb + fault.effects.arrayThermalLossDb,
      rfLossDb: aggregate.rfLossDb + fault.effects.rfLossDb,
      noiseFigureDb: aggregate.noiseFigureDb + fault.effects.noiseFigureDb,
      paPowerLimitDb: aggregate.paPowerLimitDb + fault.effects.paPowerLimitDb,
      paEfficiencyPenalty:
        aggregate.paEfficiencyPenalty + fault.effects.paEfficiencyPenalty,
      oscillatorOffsetHz: aggregate.oscillatorOffsetHz + fault.effects.oscillatorOffsetHz,
      oscillatorJitterSeconds:
        aggregate.oscillatorJitterSeconds + fault.effects.oscillatorJitterSeconds,
      busPenaltyDb: aggregate.busPenaltyDb + fault.effects.busPenaltyDb,
      computeLoadUnits: aggregate.computeLoadUnits + fault.effects.computeLoadUnits,
      thermalLoadW: aggregate.thermalLoadW + fault.effects.thermalLoadW,
    }),
    DEFAULT_FAULT_EFFECTS,
  );
}

function deriveSteeringState(
  satellite: SatelliteFrameState,
  groundStation: GroundStationDerivedState,
  groundStationEcef: { x: number; y: number; z: number },
  constants: HardwareModelConstants,
) {
  const normalizedArrayBoresight = scaleVector(
    normalizeVector(satellite.positionEcefM),
    -1,
  );
  const lineOfSight = normalizeVector(
    subtractVectors(groundStationEcef, satellite.positionEcefM),
  );
  const steeringAngleDeg =
    Math.acos(clamp(dotProduct(normalizedArrayBoresight, lineOfSight), -1, 1)) * RAD_TO_DEG;
  const clearsFieldOfRegard = steeringAngleDeg <= constants.fieldOfRegardDeg;

  return {
    steeringAngleDeg,
    fieldOfRegardDeg: constants.fieldOfRegardDeg,
    clearsFieldOfRegard,
    linkEnabled: groundStation.inPass && clearsFieldOfRegard,
  };
}
function deriveGroundTerminalState(
  groundStation: GroundStationConfig,
  groundStationState: GroundStationDerivedState,
  perturbations: GroundStationPerturbations,
  constants: HardwareModelConstants,
) {
  const pointingLossDb =
    12 *
    square(groundStationState.pointingSeparationDeg / GROUND_STATION_BEAMWIDTH_DEG);

  return {
    txPowerOffsetDb: perturbations.txPowerOffsetDb,
    rxGainOffsetDb: perturbations.rxGainOffsetDb,
    txGainOffsetDb: perturbations.txGainOffsetDb,
    txRfLossDb: constants.groundStation.txRfLossDb,
    rxNoiseFigureOffsetDb: perturbations.rxNoiseFigureOffsetDb,
    rxNoiseFigureDb:
      constants.groundStation.rxNoiseFigureNominalDb +
      perturbations.rxNoiseFigureOffsetDb,
    referenceOffsetHz: perturbations.referenceOffsetHz,
    txEvmRms: perturbations.txEvmRms,
    pointingLossDb,
    effectiveRxGainDbi:
      groundStation.antenna.gainDbi + perturbations.rxGainOffsetDb - pointingLossDb,
    effectiveTxGainDbi:
      groundStation.antenna.gainDbi + perturbations.txGainOffsetDb - pointingLossDb,
    txPowerDbw: clamp(
      constants.groundStation.txPowerNominalDbw + perturbations.txPowerOffsetDb,
      constants.groundStation.txPowerMinDbw,
      constants.groundStation.txPowerMaxDbw,
    ),
  };
}

function derivePhasedArrayState(
  dynamicState: DynamicHardwareState,
  steering: ReturnType<typeof deriveSteeringState>,
  faultAggregate: FaultAggregate,
  nominalConstants: HardwareNominalConstants,
  carrierHz: number,
  constants: HardwareModelConstants,
) {
  const degradedElementFraction = clamp(
    faultAggregate.degradedElementFraction,
    0,
    0.85,
  );
  const activeElementCount = Math.max(
    1,
    nominalConstants.phasedArray.defaultElementCount * (1 - degradedElementFraction),
  );
  const idealGainDbi =
    constants.array.elementGainDbi + 10 * Math.log10(activeElementCount);
  const steeringAngleRad = steering.steeringAngleDeg * DEG_TO_RAD;
  const cosineSteering = Math.max(Math.cos(steeringAngleRad), 1e-3);
  const scanLossDb =
    -10 *
    Math.log10(
      Math.max(Math.pow(cosineSteering, constants.array.scanLossExponent), 1e-6),
    );
  const thermalPhaseStdRad =
    constants.array.thermalPhaseStdRadAtRef +
    Math.max(0, dynamicState.arrayTempK - constants.rf.referenceTempK) *
      constants.array.thermalPhaseStdRadPerK;
  const phaseErrorVariance =
    square(constants.array.phaseLsbRad) / 12 + square(thermalPhaseStdRad);
  const phaseLossDb = 4.343 * phaseErrorVariance;
  const thermalLossDb =
    Math.max(0, dynamicState.arrayTempK - constants.rf.referenceTempK) *
      constants.array.thermalLossDbPerK +
    faultAggregate.arrayThermalLossDb;
  const fieldOfRegardExcessDeg = Math.max(
    0,
    steering.steeringAngleDeg - steering.fieldOfRegardDeg,
  );
  const pointingLossDb =
    fieldOfRegardExcessDeg === 0
      ? 0
      : constants.array.fieldOfRegardPenaltyDb +
        constants.array.fieldOfRegardPenaltySlopeDbPerDeg2 *
          square(fieldOfRegardExcessDeg);
  const arrayGainDbi =
    idealGainDbi - scanLossDb - phaseLossDb - thermalLossDb - pointingLossDb;
  const effectiveApertureM =
    constants.array.elementSpacingM * Math.sqrt(activeElementCount);
  const beamwidthDeg = clamp(
    (constants.array.beamwidthFactor *
      (physicalWavelengthM(carrierHz) /
        (effectiveApertureM * Math.max(cosineSteering, 0.12)))) *
      RAD_TO_DEG,
    0.8,
    18,
  );
  const beamQuality = Math.exp(
    -phaseErrorVariance - square(fieldOfRegardExcessDeg / beamwidthDeg),
  );

  return {
    activeElementCount,
    degradedElementFraction,
    idealGainDbi,
    scanLossDb,
    phaseLossDb,
    thermalLossDb,
    pointingLossDb,
    arrayGainDbi,
    txGainDbi: arrayGainDbi - constants.array.txCalibrationLossDb,
    rxGainDbi: arrayGainDbi - constants.array.rxCalibrationLossDb,
    beamwidthDeg,
    beamQuality,
    phaseErrorStdRad: Math.sqrt(phaseErrorVariance),
  };
}

function deriveComputeState(
  computeBacklogUnits: number,
  activeFaultCount: number,
  activeElementCount: number,
  linkEnabled: boolean,
  offeredPayloadBytesPerSecond: number,
  constants: HardwareModelConstants,
  faultAggregate: FaultAggregate,
) {
  const visibilityFactor = linkEnabled ? 1 : 0;
  const modemDemandUnits =
    constants.compute.modemDemandPerByte * offeredPayloadBytesPerSecond;
  const demandUnits =
    constants.compute.idleDemandUnits +
    constants.compute.beamDemandPerElement * activeElementCount * visibilityFactor +
    constants.compute.dopplerDemandUnits * visibilityFactor +
    modemDemandUnits +
    constants.compute.telemetryDemandPerFault * activeFaultCount +
    faultAggregate.computeLoadUnits;
  const utilization = clamp(
    demandUnits / constants.compute.capacityUnitsPerSecond,
    0,
    1,
  );

  return {
    demandUnits,
    backlogUnits: computeBacklogUnits,
    utilization,
    scheduleDelaySeconds: computeBacklogUnits / constants.compute.capacityUnitsPerSecond,
    powerDrawW:
      constants.compute.idlePowerW +
      (constants.compute.maxPowerW - constants.compute.idlePowerW) * utilization,
  };
}

function deriveOscillatorState(
  dynamicState: DynamicHardwareState,
  elapsedSeconds: number,
  frameIndex: number,
  groundStation: GroundStationDerivedState,
  frames: readonly FrameInput[],
  scheduleDelaySeconds: number,
  groundReferenceOffsetHz: number,
  faultAggregate: FaultAggregate,
  constants: HardwareModelConstants,
  stepSeconds: number,
) {
  const scheduleLagFrames = Math.ceil(scheduleDelaySeconds / stepSeconds);
  const delayedFrameIndex = Math.max(0, frameIndex - scheduleLagFrames);
  // TODO: What's the point of delayed frames?
  const delayedFrame = frames[delayedFrameIndex];
  const absoluteOffsetHz =
    constants.oscillator.baseOffsetHz +
    constants.oscillator.thermalSensitivityHzPerK *
      (dynamicState.oscillatorTempK - constants.oscillator.referenceTempK) +
    constants.oscillator.driftHzPerSecond * elapsedSeconds +
    faultAggregate.oscillatorOffsetHz;
  const downlinkDopplerEstimateHz = delayedFrame.groundStation.downlinkDopplerShiftHz;
  const uplinkDopplerEstimateHz = delayedFrame.groundStation.uplinkDopplerShiftHz;

  return {
    absoluteOffsetHz,
    scheduleLagFrames,
    downlinkDopplerEstimateHz,
    uplinkDopplerEstimateHz,
    downlinkResidualHz:
      absoluteOffsetHz +
      groundStation.downlinkDopplerShiftHz -
      downlinkDopplerEstimateHz,
    uplinkResidualHz:
      absoluteOffsetHz +
      groundReferenceOffsetHz +
      groundStation.uplinkDopplerShiftHz -
      uplinkDopplerEstimateHz,
    timingJitterSeconds: clamp(
      constants.oscillator.timingJitterBaseSeconds +
        constants.oscillator.timingJitterPerK *
          (dynamicState.oscillatorTempK - constants.oscillator.referenceTempK) +
        faultAggregate.oscillatorJitterSeconds,
      0,
      constants.oscillator.timingJitterMaxSeconds,
    ),
  };
}

function solvePowerAmplifierState(
  dynamicState: DynamicHardwareState,
  linkEnabled: boolean,
  arrayGainDbi: number,
  faultAggregate: FaultAggregate,
  computePowerW: number,
  sunExposure: number,
  thermalControlPowerW: number,
  nominalConstants: HardwareNominalConstants,
  constants: HardwareModelConstants,
) {
  let busPenaltyDb = faultAggregate.busPenaltyDb;
  let appliedOutputPowerDbw = nominalConstants.powerAmplifier.minOutputPowerDbw;
  let limitedOutputPowerDbw = nominalConstants.powerAmplifier.maxOutputPowerDbw;
  let rfOutputPowerW = 0;
  let dcDrawW = 0;

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const requestedOutputPowerDbw = linkEnabled
      ? constants.targetDownlinkEirpDbw -
        arrayGainDbi +
        constants.rf.filterLossDb +
        constants.rf.conversionLossDb +
        constants.rf.implementationLossDb +
        faultAggregate.rfLossDb
      : nominalConstants.powerAmplifier.minOutputPowerDbw;
    const temperatureDeratingDb =
      constants.powerAmplifier.derateDbPerK *
      Math.max(0, dynamicState.paTempK - constants.powerAmplifier.derateStartTempK);
    limitedOutputPowerDbw = Math.max(
      nominalConstants.powerAmplifier.minOutputPowerDbw,
      nominalConstants.powerAmplifier.maxOutputPowerDbw -
        temperatureDeratingDb -
        busPenaltyDb -
        faultAggregate.paPowerLimitDb,
    );
    appliedOutputPowerDbw = clamp(
      requestedOutputPowerDbw,
      nominalConstants.powerAmplifier.minOutputPowerDbw,
      limitedOutputPowerDbw,
    );
    rfOutputPowerW = Math.pow(10, appliedOutputPowerDbw / 10);
    const efficiency = getPowerAmplifierEfficiency(
      dynamicState.paTempK,
      faultAggregate,
      constants,
    );
    dcDrawW = rfOutputPowerW / efficiency;
    const solarGenerationW = getSolarGenerationW(sunExposure, constants);
    const provisionalLoadW =
      dcDrawW + computePowerW + thermalControlPowerW + constants.power.housePowerW;
    const batteryAssistW =
      dynamicState.batteryEnergyJ / constants.power.batteryMaxEnergyJ >
      constants.power.minSocForBatteryAssist
        ? constants.power.batteryMaxDischargeW
        : 0;
    const availablePowerW = solarGenerationW + batteryAssistW;
    const sheddingFactor =
      provisionalLoadW === 0
        ? 0
        : clamp((provisionalLoadW - availablePowerW) / provisionalLoadW, 0, 1);

    busPenaltyDb =
      constants.power.busPenaltyDbPerUnit * sheddingFactor + faultAggregate.busPenaltyDb;
  }

  const requestedOutputPowerDbw = linkEnabled
    ? constants.targetDownlinkEirpDbw -
      arrayGainDbi +
      constants.rf.filterLossDb +
      constants.rf.conversionLossDb +
      constants.rf.implementationLossDb +
      faultAggregate.rfLossDb
    : nominalConstants.powerAmplifier.minOutputPowerDbw;
  const temperatureDeratingDb =
    constants.powerAmplifier.derateDbPerK *
    Math.max(0, dynamicState.paTempK - constants.powerAmplifier.derateStartTempK);
  const inputBackoffDb =
    constants.powerAmplifier.saturationReferenceDbw - appliedOutputPowerDbw;
  const compressionLossDb =
    constants.powerAmplifier.compressionCoefficient *
    square(
      Math.max(0, nominalConstants.powerAmplifier.nominalBackoffDb - inputBackoffDb),
    );
  const efficiency = getPowerAmplifierEfficiency(
    dynamicState.paTempK,
    faultAggregate,
    constants,
  );

  return {
    requestedOutputPowerDbw,
    limitedOutputPowerDbw,
    appliedOutputPowerDbw,
    saturationReferenceDbw: constants.powerAmplifier.saturationReferenceDbw,
    inputBackoffDb,
    compressionLossDb,
    efficiency,
    rfOutputPowerW,
    dcDrawW,
    busPenaltyDb,
    temperatureDeratingDb,
  };
}

function derivePowerBusState(
  batteryEnergyJ: number,
  paDcDrawW: number,
  computePowerW: number,
  thermalControlPowerW: number,
  solarGenerationW: number,
  constants: HardwareModelConstants,
) {
  const batterySoc = batteryEnergyJ / constants.power.batteryMaxEnergyJ;
  const availablePowerW =
    solarGenerationW +
    (batterySoc > constants.power.minSocForBatteryAssist
      ? constants.power.batteryMaxDischargeW
      : 0);
  const loadPowerW =
    paDcDrawW + computePowerW + thermalControlPowerW + constants.power.housePowerW;

  return {
    batteryEnergyJ,
    batterySoc,
    availablePowerW,
    loadPowerW,
    sheddingFactor:
      loadPowerW === 0 ? 0 : clamp((loadPowerW - availablePowerW) / loadPowerW, 0, 1),
  };
}

function deriveRfFrontEndState(
  dynamicState: DynamicHardwareState,
  faultAggregate: FaultAggregate,
  nominalConstants: HardwareNominalConstants,
  constants: HardwareModelConstants,
) {
  const noiseFigureDb =
    nominalConstants.receiver.defaultNoiseFigureDb +
    constants.rf.noiseFigureTempCoefficientDbPerK *
      (dynamicState.rfTempK - constants.rf.referenceTempK) +
    faultAggregate.noiseFigureDb;

  return {
    txLossDb:
      constants.rf.filterLossDb +
      constants.rf.conversionLossDb +
      constants.rf.implementationLossDb +
      faultAggregate.rfLossDb,
    noiseFigureDb,
    satelliteRxNoiseFigureDb:
      noiseFigureDb + constants.rf.satelliteRxNoiseFigureOffsetDb,
  };
}

function deriveThermalState(
  dynamicState: DynamicHardwareState,
  sunExposure: number,
  solarGenerationW: number,
  thermalControlPowerW: number,
) {
  return {
    arrayTempC: dynamicState.arrayTempK - KELVIN_TO_CELSIUS_OFFSET,
    paTempC: dynamicState.paTempK - KELVIN_TO_CELSIUS_OFFSET,
    rfTempC: dynamicState.rfTempK - KELVIN_TO_CELSIUS_OFFSET,
    oscillatorTempC: dynamicState.oscillatorTempK - KELVIN_TO_CELSIUS_OFFSET,
    sunExposure,
    solarGenerationW,
    thermalControlPowerW,
  };
}

function deriveReasonState(
  steering: {
    steeringAngleDeg: number;
    fieldOfRegardDeg: number;
    clearsFieldOfRegard: boolean;
  },
  phasedArray: {
    scanLossDb: number;
    phaseLossDb: number;
    thermalLossDb: number;
    pointingLossDb: number;
  },
  powerAmplifier: {
    compressionLossDb: number;
    busPenaltyDb: number;
  },
  oscillator: {
    downlinkResidualHz: number;
    uplinkResidualHz: number;
  },
  dynamicState: DynamicHardwareState,
  powerBus: {
    sheddingFactor: number;
  },
  compute: {
    scheduleDelaySeconds: number;
  },
  constants: HardwareModelConstants,
): HardwareReasonState {
  const scores: Record<ReasonTag, number> = {
    array_scan_loss:
      (phasedArray.scanLossDb +
        phasedArray.phaseLossDb +
        phasedArray.thermalLossDb +
        phasedArray.pointingLossDb) /
      constants.reason.arrayTagDb,
    field_of_regard:
      steering.clearsFieldOfRegard
        ? 0
        : 1 +
          (steering.steeringAngleDeg - steering.fieldOfRegardDeg) /
            steering.fieldOfRegardDeg,
    freq_error: Math.max(
      Math.abs(oscillator.downlinkResidualHz) /
        constants.reason.downlinkFrequencyToleranceHz,
      Math.abs(oscillator.uplinkResidualHz) /
        constants.reason.uplinkFrequencyToleranceHz,
    ),
    pa_backoff:
      powerAmplifier.compressionLossDb / constants.reason.compressionTagDb,
    thermal_throttle: Math.max(
      Math.max(0, dynamicState.arrayTempK - constants.reason.temperatureThresholdK),
      Math.max(0, dynamicState.paTempK - constants.reason.temperatureThresholdK),
      Math.max(0, dynamicState.rfTempK - constants.reason.temperatureThresholdK),
      Math.max(
        0,
        dynamicState.oscillatorTempK - constants.reason.temperatureThresholdK,
      ),
    ) / constants.reason.temperatureTagSpanK,
    compute_overload:
      compute.scheduleDelaySeconds / constants.reason.scheduleDeadlineSeconds,
    power_limited: Math.max(powerBus.sheddingFactor, powerAmplifier.busPenaltyDb / 0.75),
  };
  const activeTags = REASON_TAGS.filter((tag) => scores[tag] >= 1);
  const dominantTag = REASON_TAGS.reduce<ReasonTag | null>((bestTag, currentTag) => {
    if (bestTag === null || scores[currentTag] > scores[bestTag]) {
      return currentTag;
    }

    return bestTag;
  }, null);

  return {
    activeTags,
    dominantTag:
      dominantTag && scores[dominantTag] > 0 ? dominantTag : null,
    scores,
  };
}

function advanceDynamicState(
  dynamicState: DynamicHardwareState,
  steering: {
    steeringAngleDeg: number;
    linkEnabled: boolean;
  },
  powerAmplifier: {
    dcDrawW: number;
    rfOutputPowerW: number;
  },
  compute: {
    demandUnits: number;
  },
  thermal: {
    sunExposure: number;
    thermalControlPowerW: number;
  },
  powerBus: {
    loadPowerW: number;
  },
  stepSeconds: number,
  faultAggregate: FaultAggregate,
  constants: HardwareModelConstants,
): DynamicHardwareState {
  const arrayTempK = updateTemperatureK(
    dynamicState.arrayTempK,
    constants.thermal.array,
    (steering.linkEnabled ? constants.thermal.array.baseHeatW : 0) +
      (constants.thermal.array.scanHeatCoefficientWPerDeg2 ?? 0) *
        square(steering.steeringAngleDeg) +
      faultAggregate.thermalLoadW * 0.35,
    thermal.sunExposure,
    stepSeconds,
    constants,
  );
  const paTempK = updateTemperatureK(
    dynamicState.paTempK,
    constants.thermal.pa,
    Math.max(0, powerAmplifier.dcDrawW - powerAmplifier.rfOutputPowerW) +
      faultAggregate.thermalLoadW * 0.3,
    thermal.sunExposure,
    stepSeconds,
    constants,
  );
  const rfTempK = updateTemperatureK(
    dynamicState.rfTempK,
    constants.thermal.rf,
    constants.thermal.rf.baseHeatW +
      constants.thermal.rfCpuHeatCoefficientW *
        clamp(
          compute.demandUnits / constants.compute.capacityUnitsPerSecond,
          0,
          1,
        ) +
      faultAggregate.thermalLoadW * 0.2,
    thermal.sunExposure,
    stepSeconds,
    constants,
  );
  const oscillatorTempK = updateTemperatureK(
    dynamicState.oscillatorTempK,
    constants.thermal.oscillator,
    constants.thermal.oscillator.baseHeatW + faultAggregate.thermalLoadW * 0.15,
    thermal.sunExposure,
    stepSeconds,
    constants,
  );

  return {
    arrayTempK,
    paTempK,
    rfTempK,
    oscillatorTempK,
    batteryEnergyJ: clamp(
      dynamicState.batteryEnergyJ +
        stepSeconds *
          (getSolarGenerationW(thermal.sunExposure, constants) - powerBus.loadPowerW),
      0,
      constants.power.batteryMaxEnergyJ,
    ),
    computeBacklogUnits: Math.max(
      0,
      dynamicState.computeBacklogUnits +
        stepSeconds *
          (compute.demandUnits - constants.compute.capacityUnitsPerSecond),
    ),
  };
}

function updateTemperatureK(
  currentTempK: number,
  branch: ThermalBranchConstants,
  generatedHeatW: number,
  sunExposure: number,
  stepSeconds: number,
  constants: HardwareModelConstants,
) {
  const sunHeatW = branch.sunAbsorptivity * branch.areaM2 * SOLAR_FLUX_W_PER_M2 * sunExposure;

  return (
    currentTempK +
    (stepSeconds / branch.capacitanceJPerK) *
      (generatedHeatW + sunHeatW - (currentTempK - constants.thermal.sinkTempK) / branch.resistanceKPerW)
  );
}

function getGroundStationPerturbations(
  seed: number,
  frameIndex: number,
  constants: HardwareModelConstants,
): GroundStationPerturbations {
  let state = (seed + Math.imul(2_654_435_761, frameIndex)) >>> 0;
  const epsilon = () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    const uniform = state / 2 ** 32;
    return clamp(Math.sqrt(12) * (uniform - 0.5), -2, 2);
  };

  return {
    txPowerOffsetDb: constants.groundStation.txPowerSigmaDb * epsilon(),
    rxGainOffsetDb: constants.groundStation.gainSigmaDb * epsilon(),
    txGainOffsetDb: constants.groundStation.gainSigmaDb * epsilon(),
    rxNoiseFigureOffsetDb: constants.groundStation.noiseFigureSigmaDb * epsilon(),
    referenceOffsetHz: constants.groundStation.referenceSigmaHz * epsilon(),
    txEvmRms: constants.groundStation.evmSigmaRms * Math.abs(epsilon()),
  };
}

function getSolarGenerationW(
  sunExposure: number,
  constants: HardwareModelConstants,
) {
  return (
    constants.power.solarEfficiency *
    constants.power.solarAreaM2 *
    SOLAR_FLUX_W_PER_M2 *
    sunExposure
  );
}

function getThermalControlPower(
  dynamicState: DynamicHardwareState,
  constants: HardwareModelConstants,
) {
  return (
    Math.max(0, dynamicState.arrayTempK - constants.thermal.thermalControlTargetTempK) +
    Math.max(0, dynamicState.paTempK - constants.thermal.thermalControlTargetTempK) +
    Math.max(0, dynamicState.rfTempK - constants.thermal.thermalControlTargetTempK) +
    Math.max(
      0,
      dynamicState.oscillatorTempK - constants.thermal.thermalControlTargetTempK,
    )
  ) * constants.thermal.thermalControlPowerPerK;
}

function getSunExposure(
  currentUnixMs: number,
  satellite: SatelliteFrameState,
) {
  const orbitalNormal = normalizeVector(
    crossProduct(satellite.positionEciM, satellite.velocityEciMps),
  );
  const sunVector = getApproximateSunVectorEci(currentUnixMs);

  // Approximate overall spacecraft solar exposure from the panel plane normal.
  return clamp(0.2 + 0.8 * Math.abs(dotProduct(orbitalNormal, sunVector)), 0, 1);
}

function getApproximateSunVectorEci(currentUnixMs: number) {
  const julianDate = currentUnixMs / MILLISECONDS_PER_DAY + JULIAN_DATE_AT_UNIX_EPOCH;
  const dayCount = julianDate - 2_451_545;
  const meanLongitudeDeg = normalizeDegrees(280.460 + 0.9856474 * dayCount);
  const meanAnomalyRad = normalizeDegrees(357.528 + 0.9856003 * dayCount) * DEG_TO_RAD;
  const eclipticLongitudeRad =
    (meanLongitudeDeg +
      1.915 * Math.sin(meanAnomalyRad) +
      0.02 * Math.sin(2 * meanAnomalyRad)) *
    DEG_TO_RAD;
  const obliquityRad = (23.439 - 0.0000004 * dayCount) * DEG_TO_RAD;

  return normalizeVector({
    x: Math.cos(eclipticLongitudeRad),
    y: Math.cos(obliquityRad) * Math.sin(eclipticLongitudeRad),
    z: Math.sin(obliquityRad) * Math.sin(eclipticLongitudeRad),
  });
}

function getPowerAmplifierEfficiency(
  paTempK: number,
  faultAggregate: FaultAggregate,
  constants: HardwareModelConstants,
) {
  return clamp(
    constants.powerAmplifier.efficiencyNominal -
      constants.powerAmplifier.efficiencyTempCoefficientPerK *
        (paTempK - constants.powerAmplifier.referenceTempK) -
      faultAggregate.paEfficiencyPenalty,
    constants.powerAmplifier.efficiencyMin,
    constants.powerAmplifier.efficiencyMax,
  );
}

function getDefaultFaultEffects(kind: FaultConfig["kind"], severity: number): FaultEffects {
  switch (kind) {
    case "failed_antenna_tile":
      return {
        ...DEFAULT_FAULT_EFFECTS,
        degradedElementFraction: 0.18 * severity,
        arrayThermalLossDb: 0.45 * severity,
        thermalLoadW: 18 * severity,
      };
    case "degraded_antenna_elements":
      return {
        ...DEFAULT_FAULT_EFFECTS,
        degradedElementFraction: 0.35 * severity,
        arrayThermalLossDb: 0.8 * severity,
        thermalLoadW: 22 * severity,
      };
    case "pa_efficiency_degradation":
      return {
        ...DEFAULT_FAULT_EFFECTS,
        paPowerLimitDb: 1.2 * severity,
        paEfficiencyPenalty: 0.08 * severity,
        thermalLoadW: 38 * severity,
      };
    case "oscillator_instability":
      return {
        ...DEFAULT_FAULT_EFFECTS,
        oscillatorOffsetHz: 35_000 * severity,
        oscillatorJitterSeconds: 2.2e-11 * severity,
        thermalLoadW: 8 * severity,
      };
    case "thermal_runaway":
      return {
        ...DEFAULT_FAULT_EFFECTS,
        arrayThermalLossDb: 0.9 * severity,
        paPowerLimitDb: 1.8 * severity,
        thermalLoadW: 80 * severity,
      };
    case "compute_overload":
      return {
        ...DEFAULT_FAULT_EFFECTS,
        computeLoadUnits: 45_000 * severity,
        oscillatorOffsetHz: 800 * severity,
        thermalLoadW: 16 * severity,
      };
    case "power_bus_derating":
      return {
        ...DEFAULT_FAULT_EFFECTS,
        busPenaltyDb: 1.6 * severity,
        paPowerLimitDb: 0.9 * severity,
        thermalLoadW: 12 * severity,
      };
    case "rf_chain_degradation":
      return {
        ...DEFAULT_FAULT_EFFECTS,
        rfLossDb: 1.4 * severity,
        noiseFigureDb: 1.1 * severity,
        thermalLoadW: 14 * severity,
      };
    default:
      return DEFAULT_FAULT_EFFECTS;
  }
}

function mergeFaultEffects(
  baseEffects: FaultEffects,
  overrideEffects?: Partial<FaultEffects>,
): FaultEffects {
  return {
    degradedElementFraction:
      baseEffects.degradedElementFraction +
      (overrideEffects?.degradedElementFraction ?? 0),
    arrayThermalLossDb:
      baseEffects.arrayThermalLossDb + (overrideEffects?.arrayThermalLossDb ?? 0),
    rfLossDb: baseEffects.rfLossDb + (overrideEffects?.rfLossDb ?? 0),
    noiseFigureDb: baseEffects.noiseFigureDb + (overrideEffects?.noiseFigureDb ?? 0),
    paPowerLimitDb:
      baseEffects.paPowerLimitDb + (overrideEffects?.paPowerLimitDb ?? 0),
    paEfficiencyPenalty:
      baseEffects.paEfficiencyPenalty +
      (overrideEffects?.paEfficiencyPenalty ?? 0),
    oscillatorOffsetHz:
      baseEffects.oscillatorOffsetHz + (overrideEffects?.oscillatorOffsetHz ?? 0),
    oscillatorJitterSeconds:
      baseEffects.oscillatorJitterSeconds +
      (overrideEffects?.oscillatorJitterSeconds ?? 0),
    busPenaltyDb: baseEffects.busPenaltyDb + (overrideEffects?.busPenaltyDb ?? 0),
    computeLoadUnits:
      baseEffects.computeLoadUnits + (overrideEffects?.computeLoadUnits ?? 0),
    thermalLoadW: baseEffects.thermalLoadW + (overrideEffects?.thermalLoadW ?? 0),
  };
}

function physicalWavelengthM(carrierHz: number) {
  return 299_792_458 / carrierHz;
}

function normalizeDegrees(angleDeg: number) {
  return ((angleDeg % 360) + 360) % 360;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function square(value: number) {
  return value * value;
}

function subtractVectors(
  minuend: { x: number; y: number; z: number },
  subtrahend: { x: number; y: number; z: number },
) {
  return {
    x: minuend.x - subtrahend.x,
    y: minuend.y - subtrahend.y,
    z: minuend.z - subtrahend.z,
  };
}

function scaleVector(
  vector: { x: number; y: number; z: number },
  scalar: number,
) {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
    z: vector.z * scalar,
  };
}

function normalizeVector(vector: { x: number; y: number; z: number }) {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}

function dotProduct(
  left: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number },
) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function crossProduct(
  left: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number },
) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}
