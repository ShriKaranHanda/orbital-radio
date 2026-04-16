import type {
  PhysicalConstants,
  SimulationClock,
  SimulationConfig,
  SimulationFrame,
  SimulationTrafficDirectionState,
  SimulationTrafficState,
  TrafficDirection,
  TrafficTraceReasonTag,
  TrafficTraceSample,
} from "../../../state";
import {
  getOfferedPacketRatePacketsPerSecond,
  resolveTrafficDirectionConfig,
} from "./traffic-config";

const DIRECTION_SEEDS = {
  downlink: 2_654_435_761,
  uplink: 2_246_822_519,
} as const satisfies Record<TrafficDirection, number>;

const TRAFFIC_MODEL_CONSTANTS = {
  processingDelaySeconds: 0.0045,
} as const;

type FrameInput = Pick<
  SimulationFrame,
  "index" | "currentUnixMs" | "groundStation" | "hardware" | "link"
>;

type DynamicTrafficState = Record<TrafficDirection, number>;

export function buildTrafficStates(
  frames: readonly FrameInput[],
  config: Pick<SimulationConfig, "traffic" | "scenario">,
  clock: SimulationClock,
  physicalConstants: PhysicalConstants,
): SimulationTrafficState[] {
  let queueBacklogPackets: DynamicTrafficState = {
    downlink: 0,
    uplink: 0,
  };

  return frames.map((frame) => {
    const downlink = deriveTrafficDirectionState(
      "downlink",
      frame,
      queueBacklogPackets.downlink,
      config,
      clock,
      physicalConstants,
    );
    const uplink = deriveTrafficDirectionState(
      "uplink",
      frame,
      queueBacklogPackets.uplink,
      config,
      clock,
      physicalConstants,
    );

    queueBacklogPackets = {
      downlink: downlink.nextQueueBacklogPackets,
      uplink: uplink.nextQueueBacklogPackets,
    };

    return {
      downlink: downlink.state,
      uplink: uplink.state,
    };
  });
}

function deriveTrafficDirectionState(
  direction: TrafficDirection,
  frame: FrameInput,
  queueBacklogPackets: number,
  config: Pick<SimulationConfig, "traffic" | "scenario">,
  clock: SimulationClock,
  physicalConstants: PhysicalConstants,
): {
  state: SimulationTrafficDirectionState;
  nextQueueBacklogPackets: number;
} {
  const directionConfig = resolveTrafficDirectionConfig(config.traffic, direction);
  const linkDirection = frame.link[direction];
  const stepSeconds = clock.stepSeconds;
  const stepMs = stepSeconds * 1_000;
  const packetBits = linkDirection.packetBits;
  const offeredPacketRatePacketsPerSecond =
    getOfferedPacketRatePacketsPerSecond(directionConfig);
  const queueDelaySeconds =
    linkDirection.serviceRatePacketsPerSecond > 0
      ? queueBacklogPackets / linkDirection.serviceRatePacketsPerSecond
      : null;
  const propagationDelaySeconds =
    frame.groundStation.slantRangeM / physicalConstants.speedOfLightMps;
  const offeredPacketsThisFrame = offeredPacketRatePacketsPerSecond * stepSeconds;
  const sampleCount =
    offeredPacketsThisFrame > 0
      ? Math.min(
          directionConfig.maxSamplePacketsPerSecond,
          Math.ceil(offeredPacketsThisFrame),
        )
      : 0;
  const sampleWeightPackets =
    sampleCount > 0 ? offeredPacketsThisFrame / sampleCount : 0;
  const maxAttempts = 1 + directionConfig.maxRetransmissions;
  const reasonTags = getTraceReasonTags(frame, direction);
  const rawSamples: TrafficTraceSample[] = [];
  let droppedPacketsWeight = 0;
  let successfulPacketsWeight = 0;
  let weightedRetransmissions = 0;
  let weightedLatencySeconds = 0;

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    let successAttemptIndex: number | null = null;

    for (let attemptIndex = 1; attemptIndex <= maxAttempts; attemptIndex += 1) {
      const failureDraw = getDeterministicUnitRandom(
        config.scenario.seed,
        frame.index,
        sampleIndex,
        attemptIndex,
        direction,
      );

      if (failureDraw >= linkDirection.per) {
        successAttemptIndex = attemptIndex;
        break;
      }
    }

    const dropped = successAttemptIndex === null;
    const attempts = dropped ? maxAttempts : (successAttemptIndex ?? maxAttempts);
    const representedPackets = sampleWeightPackets;
    const latencySeconds =
      dropped || queueDelaySeconds === null
        ? null
        : propagationDelaySeconds +
          frame.hardware.compute.scheduleDelaySeconds +
          queueDelaySeconds +
          TRAFFIC_MODEL_CONSTANTS.processingDelaySeconds +
          (attempts - 1) * (directionConfig.retransmissionDelayMs / 1_000);

    if (dropped) {
      droppedPacketsWeight += representedPackets;
    } else if (latencySeconds !== null) {
      successfulPacketsWeight += representedPackets;
      weightedLatencySeconds += representedPackets * latencySeconds;
    }

    weightedRetransmissions += representedPackets * (attempts - 1);

    rawSamples.push({
      id: `${direction}-${frame.index}-${sampleIndex}`,
      direction,
      sampleIndex,
      timestampUnixMs: getSampleTimestampUnixMs(
        frame.currentUnixMs,
        sampleIndex,
        sampleCount,
        stepMs,
      ),
      representedPackets,
      attempts,
      retransmissions: attempts - 1,
      dropped,
      latencySeconds,
      latencyJitterSeconds: null,
      selectedMcsLabel: linkDirection.selectedMcs.label,
      reasonTags,
    });
  }

  const packetLossFraction =
    offeredPacketsThisFrame > 0 ? droppedPacketsWeight / offeredPacketsThisFrame : 0;
  const meanLatencySeconds =
    successfulPacketsWeight > 0
      ? weightedLatencySeconds / successfulPacketsWeight
      : null;
  const jitterSeconds =
    meanLatencySeconds === null
      ? null
      : Math.sqrt(
          rawSamples.reduce((variance, sample) => {
            if (sample.latencySeconds === null) {
              return variance;
            }

            return (
              variance +
              sample.representedPackets *
                square(sample.latencySeconds - meanLatencySeconds)
            );
          }, 0) / successfulPacketsWeight,
        );
  const samples = rawSamples.map((sample) => ({
    ...sample,
    latencyJitterSeconds:
      sample.latencySeconds === null || meanLatencySeconds === null
        ? null
        : sample.latencySeconds - meanLatencySeconds,
  }));

  return {
    state: {
      offeredLoadMbps: directionConfig.offeredLoadMbps,
      packetSizeBytes: directionConfig.packetSizeBytes,
      offeredPacketRatePacketsPerSecond,
      serviceRatePacketsPerSecond: linkDirection.serviceRatePacketsPerSecond,
      queueBacklogPackets,
      queueDelaySeconds,
      propagationDelaySeconds,
      retransmissionDelaySeconds: directionConfig.retransmissionDelayMs / 1_000,
      maxAttempts,
      sampleCount,
      sampleWeightPackets,
      packetLossFraction,
      weightedRetransmissions,
      goodputBps:
        stepSeconds <= 0
          ? 0
          : (packetBits / stepSeconds) * successfulPacketsWeight,
      meanLatencySeconds,
      jitterSeconds,
      samples,
    },
    nextQueueBacklogPackets: Math.max(
      0,
      queueBacklogPackets +
        stepSeconds *
          (offeredPacketRatePacketsPerSecond -
            linkDirection.serviceRatePacketsPerSecond),
    ),
  };
}

function getSampleTimestampUnixMs(
  currentUnixMs: number,
  sampleIndex: number,
  sampleCount: number,
  stepMs: number,
) {
  if (sampleCount <= 1) {
    return currentUnixMs;
  }

  const offsetMs = Math.round(((sampleIndex + 0.5) / sampleCount) * stepMs);
  return currentUnixMs + Math.min(stepMs - 1, offsetMs);
}

function getTraceReasonTags(
  frame: FrameInput,
  direction: TrafficDirection,
): readonly TrafficTraceReasonTag[] {
  const directionLink = frame.link[direction];
  const tags = new Set<TrafficTraceReasonTag>();

  if (
    directionLink.selectedMcs.requiredSnrDb === null ||
    directionLink.effectiveSnrDb < directionLink.selectedMcs.requiredSnrDb
  ) {
    tags.add("low_snr");
  }

  for (const activeTag of frame.hardware.reason.activeTags) {
    tags.add(activeTag);
  }

  return [...tags];
}

function getDeterministicUnitRandom(
  seed: number,
  frameIndex: number,
  sampleIndex: number,
  attemptIndex: number,
  direction: TrafficDirection,
) {
  let state = seed >>> 0;

  state = (state + Math.imul(73_856_093, frameIndex)) >>> 0;
  state = (state + Math.imul(19_349_663, sampleIndex)) >>> 0;
  state = (state + Math.imul(83_492_791, attemptIndex)) >>> 0;
  state = (state + DIRECTION_SEEDS[direction]) >>> 0;

  const next = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
  return next / 2 ** 32;
}

function square(value: number) {
  return value * value;
}
