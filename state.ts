type SimulationState = {
  config: SimulationConfig;
  clock: SimulationClock;
  frames: SimFrame[];
  packets: PacketEvent[];
  aggregates: NetworkAggregates;
  ui: UiState;
};

type SimulationConfig = {
  tle: {
    name: string;
    line1: string;
    line2: string;
  };

  groundStation: {
    name: string;
    latDeg: number;
    lonDeg: number;
    altitudeM: number;
    minElevationDeg: number;
  };

  radio: {
    downlink: RadioLinkConfig;
    uplink: RadioLinkConfig;
  };

  traffic: {
    offeredLoadMbps: number;
    packetSizeBytes: number;
    maxRetransmissions: number;
    retransmissionDelayMs: number;
  };

  scenario: {
    seed: number;
    enabledFaults: FaultConfig[];
  };
};

type RadioLinkConfig = {
  carrierHz: number;
  bandwidthHz: number;
  polarization: "RHCP"
}

type SimulationClock = {
  startUnixMs: number;
  endUnixMs: number;
  stepSeconds: number; // probably 1
  currentFrameIndex: number;
  playbackRate: number;
  isPlaying: boolean;
};

type SimFrame = {
  tUnixMs: number;
  index: number;

  geometry: GeometryState;
  satellite: SatelliteState;
  ground: GroundStationState;
  link: LinkState;
  network: NetworkFrameState;

  causes: CauseTag[];
};

type GeometryState = {
  satelliteEciKm: Vec3;
  satelliteEcefKm: Vec3;

  groundAzimuthDeg: number;
  groundElevationDeg: number;
  rangeKm: number;
  rangeRateMps: number;

  dopplerHz: number;
  propagationDelayMs: number;

  visible: boolean;

  satelliteAntennaAzDeg: number;
  satelliteAntennaElDeg: number;
  scanAngleDeg: number;
  offBoresightDeg: number;
  withinFieldOfRegard: boolean;
};

type SatelliteState = {
  attitude: AttitudeState;
  array: PhasedArrayState;
  rfFrontend: RfFrontendState;
  powerAmplifier: PowerAmplifierState;
  oscillator: OscillatorState;
  thermal: ThermalState;
  powerBus: PowerBusState;
  compute: ComputeState;
  faults: FaultState;

  derivedRadio: DerivedRadioState;
};

type PhasedArrayState = {
  totalElements: number;
  activeElements: number;
  degradedElements: number;
  failedElements: number;

  commandedScanAngleDeg: number;
  scanLossDb: number;
  elementFailureLossDb: number;
  phaseErrorDegRms: number;

  arrayGainDbi: number;
  beamwidthDeg: number;
  beamQuality: number; // 0..1
  polarizationLossDb: number;
};

type PowerAmplifierState = {
  commandedPowerDbw: number;
  maxPowerDbw: number;
  actualOutputPowerDbw: number;

  backoffDb: number;
  compressionDb: number;
  distortionEvmPercent: number;

  efficiency: number;
  powerDrawW: number;
  temperatureC: number;
  thermalDeratingDb: number;
};

type OscillatorState = {
  nominalFrequencyHz: number;
  frequencyOffsetHz: number;
  driftHzPerSecond: number;
  temperatureSensitivityHzPerC: number;

  phaseNoiseDbc: number;
  timingJitterNs: number;

  dopplerCorrectionHz: number;
  dopplerResidualHz: number;
};

type ThermalState = {
  arrayTempC: number;
  paTempC: number;
  rfTempC: number;
  oscillatorTempC: number;
  computeTempC: number;

  thermalThrottleActive: boolean;
  thermalDeratingDb: number;
};

type PowerBusState = {
  solarGenerationW: number;
  batterySocPercent: number;
  busLimitW: number;

  radioPowerW: number;
  computePowerW: number;
  thermalControlPowerW: number;
  totalLoadW: number;

  powerMarginW: number;
  loadSheddingActive: boolean;
  txPowerCapDbw: number;
};

type ComputeState = {
  cpuUtilizationPercent: number;
  beamformingLoadPercent: number;
  modemLoadPercent: number;
  routingLoadPercent: number;

  schedulerLatencyMs: number;
  packetQueueDepth: number;
  missedDeadlines: number;

  dopplerUpdateAgeMs: number;
};

type DerivedRadioState = {
  txPowerDbw: number;
  arrayGainDbi: number;
  eirpDbw: number;

  carrierFrequencyHz: number;
  frequencyErrorHz: number;
  dopplerResidualHz: number;

  evmPercent: number;
  phaseNoiseDbc: number;

  pointingLossDb: number;
  polarizationLossDb: number;
  implementationLossDb: number;
};

type GroundStationState = {
  antenna: {
    gainDbi: number;
    pointingErrorDeg: number;
    pointingLossDb: number;
    polarizationLossDb: number;
    trackingLocked: boolean;
  };

  receiver: {
    bandwidthHz: number;
    noiseFigureDb: number;
    systemNoiseTempK: number;
    implementationLossDb: number;
    frequencyTrackingToleranceHz: number;
  };

  weather: {
    rainLossDb: number;
    atmosphericLossDb: number;
  };
};

type LinkState = {
  freeSpacePathLossDb: number;
  atmosphericLossDb: number;
  rainLossDb: number;

  receivedPowerDbm: number;
  noisePowerDbm: number;

  snrDb: number;
  effectiveSnrDb: number;

  dopplerResidualHz: number;
  evmPercent: number;

  selectedMcs: McsMode;
  ber: number;
  packetErrorRate: number;

  linkAvailable: boolean;
  linkMarginDb: number;
};

type NetworkFrameState = {
  offeredLoadMbps: number;
  physicalRateMbps: number;
  usableRateMbps: number;

  packetsGenerated: number;
  packetsAttempted: number;
  packetsDelivered: number;
  packetsLost: number;
  packetsRetransmitted: number;

  queueDepthPackets: number;
  meanLatencyMs: number;
  jitterMs: number;
  goodputMbps: number;
};
