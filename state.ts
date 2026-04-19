import { buildSimulationFrames as buildOrderedSimulationFrames } from "./src/lib/simulation/build-frame";

export type SimulationState = {
  config: SimulationConfig;
  clock: SimulationClock;
  mcsTable: readonly McsTableEntry[];
  physicalConstants: PhysicalConstants;
  hardwareNominalConstants: HardwareNominalConstants;
  frames: readonly SimulationFrame[];
};

export type SimulationConfig = {
  tle: TleElements;
  groundStation: GroundStationConfig;
  radio: {
    downlink: RadioLinkConfig;
    uplink: RadioLinkConfig;
  };
  traffic: TrafficConfig;
  scenario: ScenarioConfig;
};

export type TleElements = {
  name: string;
  satelliteCatalogNumber: number;
  classification: "U" | "C" | "S";
  internationalDesignator: {
    launchYear: number;
    launchNumberOfYear: number;
    launchPiece: string;
  };
  epoch: {
    year: number;
    dayOfYear: number;
    fractionalDay: number;
  };
  meanMotionFirstDerivative: number;
  meanMotionSecondDerivative: number;
  bstarDragTerm: number;
  ephemerisType: number;
  elementSetNumber: number;
  line1Checksum: number;
  inclinationDeg: number;
  rightAscensionAscendingNodeDeg: number;
  eccentricity: number;
  argumentOfPerigeeDeg: number;
  meanAnomalyDeg: number;
  meanMotionRevsPerDay: number;
  revolutionNumberAtEpoch: number;
  line2Checksum: number;
};

export type GroundStationConfig = {
  name: string;
  latDeg: number;
  lonDeg: number;
  altitudeM: number;
  minElevationDeg: number;
  horizonMask: readonly GroundStationHorizonMaskPoint[];
  antenna: GroundStationAntennaConfig;
};

export type GroundStationHorizonMaskPoint = {
  azimuthDeg: number;
  minElevationDeg: number;
};

export type GroundStationAntennaConfig = {
  mountType: "az-el";
  pointingMode: "fixed";
  azimuthDeg: number;
  elevationDeg: number;
  dishDiameterM: number;
  // TODO: Is this amplifier gain?
  gainDbi: number;
  // TODO: Is polarization currently being taken into account?
  polarization: "RHCP";
};

export type RadioLinkConfig = {
  carrierHz: number;
  bandwidthHz: number;
  polarization: "RHCP";
};

export type TrafficConfig = {
  offeredLoadMbps: number;
  packetSizeBytes: number;
  maxRetransmissions: number;
  retransmissionDelayMs: number;
  maxSamplePacketsPerSecond?: number;
  downlink?: Partial<Omit<TrafficConfig, "downlink" | "uplink">>;
  uplink?: Partial<Omit<TrafficConfig, "downlink" | "uplink">>;
};

export type ScenarioConfig = {
  seed: number;
  enabledFaults: readonly FaultConfig[];
};

export type FaultKind =
  | "failed_antenna_tile"
  | "degraded_antenna_elements"
  | "pa_efficiency_degradation"
  | "oscillator_instability"
  | "thermal_runaway"
  | "compute_overload"
  | "power_bus_derating"
  | "rf_chain_degradation";

export type FaultEffects = {
  degradedElementFraction: number;
  arrayThermalLossDb: number;
  rfLossDb: number;
  noiseFigureDb: number;
  paPowerLimitDb: number;
  paEfficiencyPenalty: number;
  oscillatorOffsetHz: number;
  oscillatorJitterSeconds: number;
  busPenaltyDb: number;
  computeLoadUnits: number;
  thermalLoadW: number;
};

export type FaultConfig = {
  id: string;
  label: string;
  startOffsetSeconds: number;
  durationSeconds: number;
  kind?: FaultKind;
  severity?: number;
  effects?: Partial<FaultEffects>;
};

export type SimulationClock = {
  startUnixMs: number;
  endUnixMs: number;
  stepSeconds: number;
};

export type McsTableEntry = {
  id: string;
  modulation: "BPSK" | "QPSK" | "8PSK" | "16QAM" | "64QAM";
  codingRate: string;
  spectralEfficiencyBitsPerHz: number;
  minSnrDb: number;
};

export type PhysicalConstants = {
  speedOfLightMps: number;
  boltzmannConstantJPerK: number;
  earthModel: {
    name: "WGS84";
    meanRadiusM: number;
    equatorialRadiusM: number;
    polarRadiusM: number;
    flattening: number;
  };
};

export type HardwareNominalConstants = {
  powerAmplifier: {
    minOutputPowerDbw: number;
    nominalOutputPowerDbw: number;
    maxOutputPowerDbw: number;
    nominalBackoffDb: number;
  };
  phasedArray: {
    defaultElementCount: number;
  };
  receiver: {
    defaultNoiseFigureDb: number;
  };
};

export type Cartesian3 = {
  x: number;
  y: number;
  z: number;
};

export type SatelliteFrameState = {
  positionEciM: Cartesian3;
  velocityEciMps: Cartesian3;
  positionEcefM: Cartesian3;
  velocityEcefMps: Cartesian3;
};

export type SunDerivedState = {
  directionEciUnit: Cartesian3;
  directionEcefUnit: Cartesian3;
  solarFluxWPerM2: number;
  sunExposureFactor: number;
};

export type GroundStationPassWindowMetadata = {
  kIn: number | null;
  kApex: number | null;
  kOut: number | null;
  passDurationSeconds: number;
  inPass: boolean;
};

export type GroundStationGeometryState = GroundStationPassWindowMetadata & {
  azimuthDeg: number;
  elevationDeg: number;
  slantRangeM: number;
  rangeRateMps: number;
  downlinkDopplerShiftHz: number;
  uplinkDopplerShiftHz: number;
  horizonMaskElevationDeg: number;
  requiredElevationDeg: number;
  isAboveGeometricHorizon: boolean;
  clearsOperationalMask: boolean;
};

export type GroundStationPointingState = {
  commandedAzimuthDeg: number;
  commandedElevationDeg: number;
  trackedAzimuthDeg: number;
  trackedElevationDeg: number;
  pointingAzimuthErrorDeg: number;
  pointingElevationErrorDeg: number;
  // TODO: How is this calculated. Also why is this required if pointing error is already present?
  pointingSeparationDeg: number;
};

export type SimulationFrame = {
  index: number;
  currentUnixMs: number;
  satellite: SatelliteFrameState;
  groundStation: GroundStationDerivedState;
  hardware: SimulationHardwareState;
  link: SimulationLinkState;
  traffic: SimulationTrafficState;
  sun: SunDerivedState;
};

export type GroundStationDerivedState = GroundStationGeometryState &
  GroundStationPointingState;

export type ActiveFaultState = {
  id: string;
  label: string;
  kind: FaultKind | "custom";
  severity: number;
  effects: FaultEffects;
};

export type GroundTerminalHardwareState = {
  txPowerOffsetDb: number;
  rxGainOffsetDb: number;
  txGainOffsetDb: number;
  txRfLossDb: number;
  rxNoiseFigureOffsetDb: number;
  rxNoiseFigureDb: number;
  referenceOffsetHz: number;
  txEvmRms: number;
  pointingLossDb: number;
  effectiveRxGainDbi: number;
  effectiveTxGainDbi: number;
  txPowerDbw: number;
};

export type SatelliteSteeringHardwareState = {
  steeringAngleDeg: number;
  fieldOfRegardDeg: number;
  clearsFieldOfRegard: boolean;
  linkEnabled: boolean;
};

export type SatellitePhasedArrayHardwareState = {
  activeElementCount: number;
  degradedElementFraction: number;
  idealGainDbi: number;
  scanLossDb: number;
  phaseLossDb: number;
  thermalLossDb: number;
  pointingLossDb: number;
  arrayGainDbi: number;
  txGainDbi: number;
  rxGainDbi: number;
  beamwidthDeg: number;
  beamQuality: number;
  phaseErrorStdRad: number;
};

export type SatelliteRfHardwareState = {
  txLossDb: number;
  noiseFigureDb: number;
  satelliteRxNoiseFigureDb: number;
};

export type SatellitePowerAmplifierHardwareState = {
  requestedOutputPowerDbw: number;
  limitedOutputPowerDbw: number;
  appliedOutputPowerDbw: number;
  saturationReferenceDbw: number;
  inputBackoffDb: number;
  compressionLossDb: number;
  efficiency: number;
  rfOutputPowerW: number;
  dcDrawW: number;
  busPenaltyDb: number;
  temperatureDeratingDb: number;
};

export type SatelliteOscillatorHardwareState = {
  absoluteOffsetHz: number;
  scheduleLagFrames: number;
  downlinkDopplerEstimateHz: number;
  uplinkDopplerEstimateHz: number;
  downlinkResidualHz: number;
  uplinkResidualHz: number;
  timingJitterSeconds: number;
};

export type SatelliteThermalHardwareState = {
  arrayTempC: number;
  paTempC: number;
  rfTempC: number;
  oscillatorTempC: number;
  sunExposure: number;
  solarGenerationW: number;
  thermalControlPowerW: number;
};

export type SatellitePowerBusHardwareState = {
  batteryEnergyJ: number;
  batterySoc: number;
  availablePowerW: number;
  loadPowerW: number;
  sheddingFactor: number;
};

export type SatelliteComputeHardwareState = {
  demandUnits: number;
  backlogUnits: number;
  utilization: number;
  scheduleDelaySeconds: number;
  powerDrawW: number;
};

export type HardwareReasonTag =
  | "array_scan_loss"
  | "field_of_regard"
  | "freq_error"
  | "pa_backoff"
  | "thermal_throttle"
  | "compute_overload"
  | "power_limited";

export type HardwareReasonState = {
  activeTags: readonly HardwareReasonTag[];
  dominantTag: HardwareReasonTag | null;
  scores: Record<HardwareReasonTag, number>;
};

export type SimulationHardwareState = {
  activeFaults: readonly ActiveFaultState[];
  steering: SatelliteSteeringHardwareState;
  groundTerminal: GroundTerminalHardwareState;
  phasedArray: SatellitePhasedArrayHardwareState;
  rfFrontEnd: SatelliteRfHardwareState;
  powerAmplifier: SatellitePowerAmplifierHardwareState;
  oscillator: SatelliteOscillatorHardwareState;
  thermal: SatelliteThermalHardwareState;
  powerBus: SatellitePowerBusHardwareState;
  compute: SatelliteComputeHardwareState;
  reason: HardwareReasonState;
};

export type LinkMcsSelectionState = {
  id: string | null;
  label: string | null;
  spectralEfficiencyBitsPerHz: number;
  requiredSnrDb: number | null;
};

export type LinkEvmState = {
  thermalSquared: number;
  cfoSquared: number;
  jitterSquared: number;
  phaseSquared: number;
  powerAmplifierSquared: number;
  groundTransmitterSquared: number;
  totalSquared: number;
  rms: number;
};

export type SimulationLinkDirectionState = {
  isOperational: boolean;
  polarizationLossDb: number;
  eirpDbw: number;
  freeSpaceLossDb: number;
  atmosphericLossDb: number;
  miscLossDb: number;
  receivePowerDbw: number;
  antennaNoiseTempK: number;
  equivalentNoiseTempK: number;
  systemNoiseTempK: number;
  noisePowerDbw: number;
  rawSnrDb: number;
  rawSnrLinear: number;
  evm: LinkEvmState;
  effectiveSnrDb: number;
  effectiveSnrLinear: number;
  selectedMcs: LinkMcsSelectionState;
  ber: number;
  per: number;
  packetBits: number;
  scheduledPayloadRateBps: number;
  serviceRatePacketsPerSecond: number;
};

export type SimulationLinkState = {
  downlink: SimulationLinkDirectionState;
  uplink: SimulationLinkDirectionState;
};

export type TrafficDirection = "downlink" | "uplink";

export type TrafficTraceReasonTag =
  | "low_snr"
  | "array_scan_loss"
  | "field_of_regard"
  | "freq_error"
  | "pa_backoff"
  | "thermal_throttle"
  | "compute_overload"
  | "power_limited";

export type TrafficTraceSample = {
  id: string;
  direction: TrafficDirection;
  sampleIndex: number;
  timestampUnixMs: number;
  representedPackets: number;
  attempts: number;
  retransmissions: number;
  dropped: boolean;
  latencySeconds: number | null;
  latencyJitterSeconds: number | null;
  selectedMcsLabel: string | null;
  reasonTags: readonly TrafficTraceReasonTag[];
};

export type SimulationTrafficDirectionState = {
  offeredLoadMbps: number;
  packetSizeBytes: number;
  offeredPacketRatePacketsPerSecond: number;
  serviceRatePacketsPerSecond: number;
  queueBacklogPackets: number;
  queueDelaySeconds: number | null;
  propagationDelaySeconds: number;
  retransmissionDelaySeconds: number;
  maxAttempts: number;
  sampleCount: number;
  sampleWeightPackets: number;
  packetLossFraction: number;
  weightedRetransmissions: number;
  goodputBps: number;
  meanLatencySeconds: number | null;
  jitterSeconds: number | null;
  samples: readonly TrafficTraceSample[];
};

export type SimulationTrafficState = {
  downlink: SimulationTrafficDirectionState;
  uplink: SimulationTrafficDirectionState;
};

export const GROUND_STATION_STEERING_LIMITS = {
  maxAzimuthRateDegPerSecond: 1.2,
  maxElevationRateDegPerSecond: 1.2,
} as const;

export const GROUND_STATION_3DB_BEAMWIDTH_DEG = 0.7;

export const PHYSICAL_CONSTANTS: PhysicalConstants = {
  speedOfLightMps: 299_792_458,
  boltzmannConstantJPerK: 1.380649e-23,
  earthModel: {
    name: "WGS84",
    meanRadiusM: 6_371_008.8,
    equatorialRadiusM: 6_378_137,
    polarRadiusM: 6_356_752.314245,
    flattening: 1 / 298.257223563,
  },
};

export const HARDWARE_NOMINAL_CONSTANTS: HardwareNominalConstants = {
  powerAmplifier: {
    minOutputPowerDbw: -5,
    nominalOutputPowerDbw: 6,
    maxOutputPowerDbw: 9,
    nominalBackoffDb: 2,
  },
  phasedArray: {
    defaultElementCount: 256,
  },
  receiver: {
    defaultNoiseFigureDb: 1.8,
  },
};

export const MCS_TABLE: readonly McsTableEntry[] = [
  {
    id: "MCS-0",
    modulation: "BPSK",
    codingRate: "1/2",
    spectralEfficiencyBitsPerHz: 0.5,
    minSnrDb: 1.0,
  },
  {
    id: "MCS-1",
    modulation: "QPSK",
    codingRate: "1/2",
    spectralEfficiencyBitsPerHz: 1.0,
    minSnrDb: 3.0,
  },
  {
    id: "MCS-2",
    modulation: "QPSK",
    codingRate: "3/4",
    spectralEfficiencyBitsPerHz: 1.5,
    minSnrDb: 6.0,
  },
  {
    id: "MCS-3",
    modulation: "8PSK",
    codingRate: "2/3",
    spectralEfficiencyBitsPerHz: 2.0,
    minSnrDb: 9.0,
  },
  {
    id: "MCS-4",
    modulation: "16QAM",
    codingRate: "1/2",
    spectralEfficiencyBitsPerHz: 2.0,
    minSnrDb: 12.0,
  },
  {
    id: "MCS-5",
    modulation: "16QAM",
    codingRate: "3/4",
    spectralEfficiencyBitsPerHz: 3.0,
    minSnrDb: 15.0,
  },
  {
    id: "MCS-6",
    modulation: "64QAM",
    codingRate: "2/3",
    spectralEfficiencyBitsPerHz: 4.0,
    minSnrDb: 19.0,
  },
  {
    id: "MCS-7",
    modulation: "64QAM",
    codingRate: "5/6",
    spectralEfficiencyBitsPerHz: 5.0,
    minSnrDb: 22.5,
  },
];

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  // STARLINK-1008
  // 1 44714U 19074B   26102.16021996  .00047530  00000+0  13979-2 0  9995
  // 2 44714  53.1560  22.7027 0003306 151.7589 208.3593 15.34644574354005
  tle: {
    name: "STARLINK-1008",
    satelliteCatalogNumber: 44714,
    classification: "U",
    internationalDesignator: {
      launchYear: 2019,
      launchNumberOfYear: 74,
      launchPiece: "B",
    },
    epoch: {
      year: 2026,
      dayOfYear: 102,
      fractionalDay: 0.16021996,
    },
    meanMotionFirstDerivative: 0.0004753,
    meanMotionSecondDerivative: 0,
    bstarDragTerm: 0.0013979,
    ephemerisType: 0,
    elementSetNumber: 999,
    line1Checksum: 5,
    inclinationDeg: 53.156,
    rightAscensionAscendingNodeDeg: 22.7027,
    eccentricity: 0.0003306,
    argumentOfPerigeeDeg: 151.7589,
    meanAnomalyDeg: 208.3593,
    meanMotionRevsPerDay: 15.34644574,
    revolutionNumberAtEpoch: 35400,
    line2Checksum: 5,
  },
  // TODO: Update Bengaluru ground station to Texas ground station
  groundStation: {
    name: "Starbase Ground Station",
    latDeg: 25.98973764557198,
    lonDeg: -97.18477949691587,
    altitudeM: 10,
    minElevationDeg: 2,
    horizonMask: [
      { azimuthDeg: 0, minElevationDeg: 5 },
      { azimuthDeg: 45, minElevationDeg: 3 },
      { azimuthDeg: 90, minElevationDeg: 3 },
      { azimuthDeg: 135, minElevationDeg: 3 },
      { azimuthDeg: 180, minElevationDeg: 7 },
      { azimuthDeg: 225, minElevationDeg: 10 },
      { azimuthDeg: 270, minElevationDeg: 10 },
      { azimuthDeg: 315, minElevationDeg: 13 },
    ],
    antenna: {
      mountType: "az-el",
      pointingMode: "fixed",
      azimuthDeg: 92,
      elevationDeg: 31,
      dishDiameterM: 2.4,
      gainDbi: 43.5,
      polarization: "RHCP",
    },
  },
  radio: {
    downlink: {
      carrierHz: 18_200_000_000,
      bandwidthHz: 250_000_000,
      polarization: "RHCP",
    },
    uplink: {
      carrierHz: 28_300_000_000,
      bandwidthHz: 250_000_000,
      polarization: "RHCP",
    },
  },
  traffic: {
    offeredLoadMbps: 200,
    packetSizeBytes: 1200,
    maxRetransmissions: 3,
    retransmissionDelayMs: 100,
    maxSamplePacketsPerSecond: 16,
  },
  scenario: {
    seed: 44714,
    enabledFaults: [
      // TODO: Why does this have such little impact?
      {
        id: "array-tile-degradation",
        label: "Antenna tile degradation",
        kind: "failed_antenna_tile",
        severity: 0.8,
        startOffsetSeconds: 530,
        durationSeconds: 30,
      },
      {
        id: "compute-overload",
        label: "Onboard compute overload",
        kind: "compute_overload",
        severity: 0.75,
        startOffsetSeconds: 600,
        durationSeconds: 40,
      },
      {
        id: "power-bus-derating",
        label: "Power bus derating",
        kind: "power_bus_derating",
        severity: 0.65,
        startOffsetSeconds: 770,
        durationSeconds: 50,
      },
      {
        id: "oscillator-instability",
        label: "Oscillator instability burst",
        kind: "oscillator_instability",
        severity: 0.7,
        startOffsetSeconds: 951,
        durationSeconds: 40,
      },
    ],
  },
};

const TLE_EPOCH_UNIX_MS = tleEpochToUnixMs({
  year: 2026,
  dayOfYear: 102,
  fractionalDay: 0.1771412037037,
});
const DEFAULT_SIMULATION_DURATION_SECONDS = 1500;

export const DEFAULT_SIMULATION_CLOCK: SimulationClock = {
  startUnixMs: TLE_EPOCH_UNIX_MS,
  endUnixMs:
    TLE_EPOCH_UNIX_MS + (DEFAULT_SIMULATION_DURATION_SECONDS - 1) * 1_000,
  stepSeconds: 1,
};

export function buildSimulationFrames(
  config: Pick<
    SimulationConfig,
    "tle" | "groundStation" | "radio" | "traffic" | "scenario"
  >,
  clock: SimulationClock,
  physicalConstants: PhysicalConstants,
): SimulationFrame[] {
  return buildOrderedSimulationFrames(
    config,
    clock,
    physicalConstants,
    GROUND_STATION_STEERING_LIMITS,
    HARDWARE_NOMINAL_CONSTANTS,
  );
}

export const DEFAULT_SIMULATION_STATE: SimulationState = {
  config: DEFAULT_SIMULATION_CONFIG,
  clock: DEFAULT_SIMULATION_CLOCK,
  mcsTable: MCS_TABLE,
  physicalConstants: PHYSICAL_CONSTANTS,
  hardwareNominalConstants: HARDWARE_NOMINAL_CONSTANTS,
  frames: buildSimulationFrames(
    DEFAULT_SIMULATION_CONFIG,
    DEFAULT_SIMULATION_CLOCK,
    PHYSICAL_CONSTANTS,
  ),
};

function tleEpochToUnixMs(epoch: TleElements["epoch"]): number {
  const dayStartUnixMs = Date.UTC(epoch.year, 0, epoch.dayOfYear);
  const fractionalDayMs = epoch.fractionalDay * 86_400_000;

  return Math.round(dayStartUnixMs + fractionalDayMs);
}
