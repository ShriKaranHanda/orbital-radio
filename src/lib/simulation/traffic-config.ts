import type { SimulationConfig, TrafficConfig, TrafficDirection } from "../../../state";

export type ResolvedTrafficDirectionConfig = {
  offeredLoadMbps: number;
  packetSizeBytes: number;
  maxRetransmissions: number;
  retransmissionDelayMs: number;
  maxSamplePacketsPerSecond: number;
};

const DEFAULT_MAX_SAMPLE_PACKETS_PER_SECOND = 16;

export function resolveTrafficDirectionConfig(
  traffic: SimulationConfig["traffic"],
  direction: TrafficDirection,
): ResolvedTrafficDirectionConfig {
  const overrides = traffic[direction];

  return {
    offeredLoadMbps: overrides?.offeredLoadMbps ?? traffic.offeredLoadMbps,
    packetSizeBytes: overrides?.packetSizeBytes ?? traffic.packetSizeBytes,
    maxRetransmissions:
      overrides?.maxRetransmissions ?? traffic.maxRetransmissions,
    retransmissionDelayMs:
      overrides?.retransmissionDelayMs ?? traffic.retransmissionDelayMs,
    maxSamplePacketsPerSecond:
      overrides?.maxSamplePacketsPerSecond ??
      traffic.maxSamplePacketsPerSecond ??
      DEFAULT_MAX_SAMPLE_PACKETS_PER_SECOND,
  };
}

export function getOfferedPacketRatePacketsPerSecond(
  config: Pick<ResolvedTrafficDirectionConfig, "offeredLoadMbps" | "packetSizeBytes">,
) {
  if (config.packetSizeBytes <= 0) {
    return 0;
  }

  return (config.offeredLoadMbps * 1_000_000) / (8 * config.packetSizeBytes);
}

export function getPacketBits(
  config: Pick<TrafficConfig, "packetSizeBytes">,
) {
  return Math.max(0, config.packetSizeBytes) * 8;
}
