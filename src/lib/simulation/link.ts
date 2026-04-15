import type {
  GroundStationDerivedState,
  PhysicalConstants,
  SimulationConfig,
  SimulationHardwareState,
  SimulationLinkDirectionState,
  SimulationLinkState,
} from "../../../state";

const DEG_TO_RAD = Math.PI / 180;
const MIN_LINEAR = 1e-30;

type LinkMcsModel = {
  id: string;
  label: string;
  spectralEfficiencyBitsPerHz: number;
  requiredSnrDb: number;
  logisticSlope: number;
  berMin: number;
  berMax: number;
};

type LinkDirectionConstants = {
  zenithAtmosphericLossDb: number;
  miscLossDb: number;
  cfoEvmCoefficient: number;
  paEvmCoefficient: number;
  symbolRateBaud: number;
  linkMarginDb: number;
  macOverheadFraction: number;
  pa1DbCompressionPointDbw: number;
  antennaNoiseTempK: number;
  mcsTable: readonly LinkMcsModel[];
};

const LINK_MODEL_CONSTANTS = {
  minimumElevationFloorDeg: 5,
  downlink: {
    zenithAtmosphericLossDb: 1.35,
    miscLossDb: 0.9,
    cfoEvmCoefficient: 5_000_000,
    paEvmCoefficient: 0.028,
    symbolRateBaud: 220_000_000,
    linkMarginDb: 1.5,
    macOverheadFraction: 0.12,
    pa1DbCompressionPointDbw: 6.7,
    antennaNoiseTempK: 155,
    mcsTable: [
      {
        id: "MCS-0",
        label: "BPSK 1/2",
        spectralEfficiencyBitsPerHz: 0.5,
        requiredSnrDb: 1,
        logisticSlope: 3.6,
        berMin: 1e-9,
        berMax: 5e-4,
      },
      {
        id: "MCS-1",
        label: "QPSK 1/2",
        spectralEfficiencyBitsPerHz: 1,
        requiredSnrDb: 3,
        logisticSlope: 3.4,
        berMin: 1e-9,
        berMax: 7e-4,
      },
      {
        id: "MCS-2",
        label: "QPSK 3/4",
        spectralEfficiencyBitsPerHz: 1.5,
        requiredSnrDb: 6,
        logisticSlope: 3.1,
        berMin: 1e-9,
        berMax: 9e-4,
      },
      {
        id: "MCS-3",
        label: "8PSK 2/3",
        spectralEfficiencyBitsPerHz: 2,
        requiredSnrDb: 9,
        logisticSlope: 2.8,
        berMin: 1e-8,
        berMax: 0.0012,
      },
      {
        id: "MCS-4",
        label: "16QAM 1/2",
        spectralEfficiencyBitsPerHz: 2,
        requiredSnrDb: 12,
        logisticSlope: 2.6,
        berMin: 1e-8,
        berMax: 0.0016,
      },
      {
        id: "MCS-5",
        label: "16QAM 3/4",
        spectralEfficiencyBitsPerHz: 3,
        requiredSnrDb: 15,
        logisticSlope: 2.4,
        berMin: 1e-7,
        berMax: 0.002,
      },
      {
        id: "MCS-6",
        label: "64QAM 2/3",
        spectralEfficiencyBitsPerHz: 4,
        requiredSnrDb: 19,
        logisticSlope: 2.2,
        berMin: 1e-6,
        berMax: 0.003,
      },
      {
        id: "MCS-7",
        label: "64QAM 5/6",
        spectralEfficiencyBitsPerHz: 5,
        requiredSnrDb: 22.5,
        logisticSlope: 2,
        berMin: 1e-5,
        berMax: 0.004,
      },
    ],
  },
  uplink: {
    zenithAtmosphericLossDb: 2.1,
    miscLossDb: 1.15,
    cfoEvmCoefficient: 6_500_000,
    paEvmCoefficient: 0,
    symbolRateBaud: 215_000_000,
    linkMarginDb: 2,
    macOverheadFraction: 0.1,
    pa1DbCompressionPointDbw: 0,
    antennaNoiseTempK: 185,
    mcsTable: [
      {
        id: "MCS-0",
        label: "BPSK 1/2",
        spectralEfficiencyBitsPerHz: 0.5,
        requiredSnrDb: 1.5,
        logisticSlope: 3.5,
        berMin: 1e-9,
        berMax: 6e-4,
      },
      {
        id: "MCS-1",
        label: "QPSK 1/2",
        spectralEfficiencyBitsPerHz: 1,
        requiredSnrDb: 3.5,
        logisticSlope: 3.25,
        berMin: 1e-9,
        berMax: 8e-4,
      },
      {
        id: "MCS-2",
        label: "QPSK 3/4",
        spectralEfficiencyBitsPerHz: 1.5,
        requiredSnrDb: 6.5,
        logisticSlope: 3,
        berMin: 1e-9,
        berMax: 0.001,
      },
      {
        id: "MCS-3",
        label: "8PSK 2/3",
        spectralEfficiencyBitsPerHz: 2,
        requiredSnrDb: 9.5,
        logisticSlope: 2.75,
        berMin: 1e-8,
        berMax: 0.0013,
      },
      {
        id: "MCS-4",
        label: "16QAM 1/2",
        spectralEfficiencyBitsPerHz: 2,
        requiredSnrDb: 12.5,
        logisticSlope: 2.55,
        berMin: 1e-8,
        berMax: 0.0017,
      },
      {
        id: "MCS-5",
        label: "16QAM 3/4",
        spectralEfficiencyBitsPerHz: 3,
        requiredSnrDb: 15.5,
        logisticSlope: 2.35,
        berMin: 1e-7,
        berMax: 0.0022,
      },
      {
        id: "MCS-6",
        label: "64QAM 2/3",
        spectralEfficiencyBitsPerHz: 4,
        requiredSnrDb: 19.5,
        logisticSlope: 2.15,
        berMin: 1e-6,
        berMax: 0.0032,
      },
      {
        id: "MCS-7",
        label: "64QAM 5/6",
        spectralEfficiencyBitsPerHz: 5,
        requiredSnrDb: 23.5,
        logisticSlope: 1.95,
        berMin: 1e-5,
        berMax: 0.0042,
      },
    ],
  },
} as const satisfies {
  minimumElevationFloorDeg: number;
  downlink: LinkDirectionConstants;
  uplink: LinkDirectionConstants;
};

export function deriveLinkState(
  config: Pick<SimulationConfig, "groundStation" | "radio" | "traffic">,
  physicalConstants: PhysicalConstants,
  groundStation: GroundStationDerivedState,
  hardware: SimulationHardwareState,
): SimulationLinkState {
  return {
    downlink: deriveDownlinkState(config, physicalConstants, groundStation, hardware),
    uplink: deriveUplinkState(config, physicalConstants, groundStation, hardware),
  };
}

function deriveDownlinkState(
  config: Pick<SimulationConfig, "groundStation" | "radio" | "traffic">,
  physicalConstants: PhysicalConstants,
  groundStation: GroundStationDerivedState,
  hardware: SimulationHardwareState,
): SimulationLinkDirectionState {
  const constants = LINK_MODEL_CONSTANTS.downlink;
  const packetBits = config.traffic.packetSizeBytes * 8;
  const polarizationLossDb = getPolarizationLossDb(
    config.groundStation.antenna.polarization,
    config.groundStation.antenna.polarization,
  );
  const eirpDbw =
    hardware.powerAmplifier.appliedOutputPowerDbw +
    hardware.phasedArray.txGainDbi -
    hardware.rfFrontEnd.txLossDb -
    hardware.powerAmplifier.compressionLossDb -
    polarizationLossDb;
  const freeSpaceLossDb = getFreeSpaceLossDb(
    groundStation.slantRangeM,
    config.radio.downlink.carrierHz,
    physicalConstants.speedOfLightMps,
  );
  const atmosphericLossDb = getAtmosphericLossDb(
    groundStation.elevationDeg,
    constants.zenithAtmosphericLossDb,
  );
  const receivePowerDbw =
    eirpDbw +
    hardware.groundTerminal.effectiveRxGainDbi -
    freeSpaceLossDb -
    atmosphericLossDb -
    constants.miscLossDb;
  const equivalentNoiseTempK = getEquivalentNoiseTempK(
    hardware.groundTerminal.rxNoiseFigureDb,
  );
  const systemNoiseTempK = constants.antennaNoiseTempK + equivalentNoiseTempK;
  const noisePowerDbw = getNoisePowerDbw(
    physicalConstants.boltzmannConstantJPerK,
    systemNoiseTempK,
    config.radio.downlink.bandwidthHz,
  );
  const rawSnrDb = receivePowerDbw - noisePowerDbw;
  const rawSnrLinear = dbToLinear(rawSnrDb);
  const evm = getEvmState({
    rawSnrLinear,
    residualFrequencyHz: hardware.oscillator.downlinkResidualHz,
    symbolRateBaud: constants.symbolRateBaud,
    cfoEvmCoefficient: constants.cfoEvmCoefficient,
    bandwidthHz: config.radio.downlink.bandwidthHz,
    timingJitterSeconds: hardware.oscillator.timingJitterSeconds,
    phaseErrorStdRad: hardware.phasedArray.phaseErrorStdRad,
    powerAmplifierSquared:
      constants.paEvmCoefficient *
      square(
        Math.max(
          0,
          hardware.powerAmplifier.appliedOutputPowerDbw -
            constants.pa1DbCompressionPointDbw,
        ),
      ),
    groundTransmitterSquared: 0,
  });
  const effectiveSnrLinear = 1 / Math.max(evm.totalSquared, MIN_LINEAR);
  const effectiveSnrDb = linearToDb(effectiveSnrLinear);
  const selectedMcsModel = getSelectedMcsModel(
    constants.mcsTable,
    effectiveSnrDb,
    constants.linkMarginDb,
    hardware.steering.linkEnabled,
  );
  const selectedMcs = toMcsSelectionState(selectedMcsModel);
  const ber = getBer(selectedMcsModel, effectiveSnrDb);
  const per = getPer(ber, packetBits);
  const scheduledPayloadRateBps =
    selectedMcs.spectralEfficiencyBitsPerHz *
    config.radio.downlink.bandwidthHz *
    (1 - constants.macOverheadFraction);

  return {
    isOperational: hardware.steering.linkEnabled,
    polarizationLossDb,
    eirpDbw,
    freeSpaceLossDb,
    atmosphericLossDb,
    miscLossDb: constants.miscLossDb,
    receivePowerDbw,
    antennaNoiseTempK: constants.antennaNoiseTempK,
    equivalentNoiseTempK,
    systemNoiseTempK,
    noisePowerDbw,
    rawSnrDb,
    rawSnrLinear,
    evm,
    effectiveSnrDb,
    effectiveSnrLinear,
    selectedMcs,
    ber,
    per,
    packetBits,
    scheduledPayloadRateBps,
    serviceRatePacketsPerSecond:
      packetBits === 0 ? 0 : scheduledPayloadRateBps / packetBits,
  };
}

function deriveUplinkState(
  config: Pick<SimulationConfig, "groundStation" | "radio" | "traffic">,
  physicalConstants: PhysicalConstants,
  groundStation: GroundStationDerivedState,
  hardware: SimulationHardwareState,
): SimulationLinkDirectionState {
  const constants = LINK_MODEL_CONSTANTS.uplink;
  const packetBits = config.traffic.packetSizeBytes * 8;
  const polarizationLossDb = getPolarizationLossDb(
    config.groundStation.antenna.polarization,
    config.groundStation.antenna.polarization,
  );
  const eirpDbw =
    hardware.groundTerminal.txPowerDbw +
    hardware.groundTerminal.effectiveTxGainDbi -
    hardware.groundTerminal.txRfLossDb -
    polarizationLossDb;
  const freeSpaceLossDb = getFreeSpaceLossDb(
    groundStation.slantRangeM,
    config.radio.uplink.carrierHz,
    physicalConstants.speedOfLightMps,
  );
  const atmosphericLossDb = getAtmosphericLossDb(
    groundStation.elevationDeg,
    constants.zenithAtmosphericLossDb,
  );
  const receivePowerDbw =
    eirpDbw +
    hardware.phasedArray.rxGainDbi -
    freeSpaceLossDb -
    atmosphericLossDb -
    constants.miscLossDb;
  const equivalentNoiseTempK = getEquivalentNoiseTempK(
    hardware.rfFrontEnd.satelliteRxNoiseFigureDb,
  );
  const systemNoiseTempK = constants.antennaNoiseTempK + equivalentNoiseTempK;
  const noisePowerDbw = getNoisePowerDbw(
    physicalConstants.boltzmannConstantJPerK,
    systemNoiseTempK,
    config.radio.uplink.bandwidthHz,
  );
  const rawSnrDb = receivePowerDbw - noisePowerDbw;
  const rawSnrLinear = dbToLinear(rawSnrDb);
  const evm = getEvmState({
    rawSnrLinear,
    residualFrequencyHz: hardware.oscillator.uplinkResidualHz,
    symbolRateBaud: constants.symbolRateBaud,
    cfoEvmCoefficient: constants.cfoEvmCoefficient,
    bandwidthHz: config.radio.uplink.bandwidthHz,
    timingJitterSeconds: hardware.oscillator.timingJitterSeconds,
    phaseErrorStdRad: hardware.phasedArray.phaseErrorStdRad,
    powerAmplifierSquared: 0,
    groundTransmitterSquared: square(hardware.groundTerminal.txEvmRms),
  });
  const effectiveSnrLinear = 1 / Math.max(evm.totalSquared, MIN_LINEAR);
  const effectiveSnrDb = linearToDb(effectiveSnrLinear);
  const selectedMcsModel = getSelectedMcsModel(
    constants.mcsTable,
    effectiveSnrDb,
    constants.linkMarginDb,
    hardware.steering.linkEnabled,
  );
  const selectedMcs = toMcsSelectionState(selectedMcsModel);
  const ber = getBer(selectedMcsModel, effectiveSnrDb);
  const per = getPer(ber, packetBits);
  const scheduledPayloadRateBps =
    selectedMcs.spectralEfficiencyBitsPerHz *
    config.radio.uplink.bandwidthHz *
    (1 - constants.macOverheadFraction);

  return {
    isOperational: hardware.steering.linkEnabled,
    polarizationLossDb,
    eirpDbw,
    freeSpaceLossDb,
    atmosphericLossDb,
    miscLossDb: constants.miscLossDb,
    receivePowerDbw,
    antennaNoiseTempK: constants.antennaNoiseTempK,
    equivalentNoiseTempK,
    systemNoiseTempK,
    noisePowerDbw,
    rawSnrDb,
    rawSnrLinear,
    evm,
    effectiveSnrDb,
    effectiveSnrLinear,
    selectedMcs,
    ber,
    per,
    packetBits,
    scheduledPayloadRateBps,
    serviceRatePacketsPerSecond:
      packetBits === 0 ? 0 : scheduledPayloadRateBps / packetBits,
  };
}

function getSelectedMcsModel(
  mcsTable: readonly LinkMcsModel[],
  effectiveSnrDb: number,
  marginDb: number,
  isOperational: boolean,
): LinkMcsModel | null {
  if (!isOperational) {
    return null;
  }

  const selected = [...mcsTable]
    .reverse()
    .find((entry) => effectiveSnrDb >= entry.requiredSnrDb + marginDb);

  return selected ?? null;
}

function toMcsSelectionState(
  mcsModel: LinkMcsModel | null,
): SimulationLinkDirectionState["selectedMcs"] {
  if (!mcsModel) {
    return {
      id: null,
      label: null,
      spectralEfficiencyBitsPerHz: 0,
      requiredSnrDb: null,
    };
  }

  return {
    id: mcsModel.id,
    label: mcsModel.label,
    spectralEfficiencyBitsPerHz: mcsModel.spectralEfficiencyBitsPerHz,
    requiredSnrDb: mcsModel.requiredSnrDb,
  };
}

function getBer(mcsModel: LinkMcsModel | null, effectiveSnrDb: number) {
  if (!mcsModel) {
    return 1;
  }

  return clamp(
    mcsModel.berMin +
      (mcsModel.berMax - mcsModel.berMin) /
        (1 +
          Math.exp(
            mcsModel.logisticSlope *
              (effectiveSnrDb - mcsModel.requiredSnrDb),
          )),
    mcsModel.berMin,
    mcsModel.berMax,
  );
}

function getPer(ber: number, packetBits: number) {
  if (packetBits <= 0) {
    return 0;
  }

  if (ber <= 0) {
    return 0;
  }

  if (ber >= 1) {
    return 1;
  }

  return clamp(1 - Math.exp(packetBits * Math.log1p(-ber)), 0, 1);
}

function getEvmState(input: {
  rawSnrLinear: number;
  residualFrequencyHz: number;
  symbolRateBaud: number;
  cfoEvmCoefficient: number;
  bandwidthHz: number;
  timingJitterSeconds: number;
  phaseErrorStdRad: number;
  powerAmplifierSquared: number;
  groundTransmitterSquared: number;
}) {
  const thermalSquared = 1 / Math.max(input.rawSnrLinear, MIN_LINEAR);
  const cfoSquared =
    input.cfoEvmCoefficient *
    square(input.residualFrequencyHz / Math.max(input.symbolRateBaud, 1));
  const jitterSquared = square(
    2 * Math.PI * input.bandwidthHz * input.timingJitterSeconds,
  );
  const phaseSquared = 2 * (1 - Math.exp(-square(input.phaseErrorStdRad)));
  const totalSquared =
    thermalSquared +
    cfoSquared +
    jitterSquared +
    phaseSquared +
    input.powerAmplifierSquared +
    input.groundTransmitterSquared;

  return {
    thermalSquared,
    cfoSquared,
    jitterSquared,
    phaseSquared,
    powerAmplifierSquared: input.powerAmplifierSquared,
    groundTransmitterSquared: input.groundTransmitterSquared,
    totalSquared,
    rms: Math.sqrt(totalSquared),
  };
}

function getPolarizationLossDb(
  txPolarization: SimulationConfig["groundStation"]["antenna"]["polarization"],
  rxPolarization: SimulationConfig["groundStation"]["antenna"]["polarization"],
) {
  return txPolarization === rxPolarization ? 0 : 20;
}

function getFreeSpaceLossDb(
  slantRangeM: number,
  carrierHz: number,
  speedOfLightMps: number,
) {
  const wavelengthM = speedOfLightMps / carrierHz;
  return 20 * Math.log10((4 * Math.PI * Math.max(slantRangeM, 1)) / wavelengthM);
}

function getAtmosphericLossDb(elevationDeg: number, zenithLossDb: number) {
  const floorSin = Math.sin(LINK_MODEL_CONSTANTS.minimumElevationFloorDeg * DEG_TO_RAD);
  const elevationSin = Math.sin(elevationDeg * DEG_TO_RAD);
  return zenithLossDb / Math.max(elevationSin, floorSin);
}

function getEquivalentNoiseTempK(noiseFigureDb: number) {
  return 290 * (dbToLinear(noiseFigureDb) - 1);
}

function getNoisePowerDbw(
  boltzmannConstantJPerK: number,
  systemNoiseTempK: number,
  bandwidthHz: number,
) {
  return linearToDb(
    Math.max(boltzmannConstantJPerK * systemNoiseTempK * bandwidthHz, MIN_LINEAR),
  );
}

function dbToLinear(valueDb: number) {
  return Math.pow(10, valueDb / 10);
}

function linearToDb(valueLinear: number) {
  return 10 * Math.log10(Math.max(valueLinear, MIN_LINEAR));
}

function square(value: number) {
  return value * value;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
