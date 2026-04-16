import { describe, expect, test } from "bun:test";
import { DEFAULT_SIMULATION_STATE } from "../state";

describe("simulation traffic", () => {
  test("derives deterministic packet traces and goodput during the active pass", () => {
    const apexFrame = DEFAULT_SIMULATION_STATE.frames[726];

    expect(apexFrame.traffic.downlink.sampleCount).toBeGreaterThan(0);
    expect(apexFrame.traffic.uplink.sampleCount).toBeGreaterThan(0);
    expect(apexFrame.traffic.downlink.samples).toHaveLength(
      apexFrame.traffic.downlink.sampleCount,
    );
    expect(apexFrame.traffic.uplink.samples).toHaveLength(
      apexFrame.traffic.uplink.sampleCount,
    );
    expect(apexFrame.traffic.downlink.goodputBps).toBeGreaterThan(0);
    expect(apexFrame.traffic.uplink.goodputBps).toBeGreaterThan(0);
    expect(apexFrame.traffic.downlink.meanLatencySeconds).not.toBeNull();
    expect(apexFrame.traffic.uplink.meanLatencySeconds).not.toBeNull();
    expect(
      apexFrame.traffic.downlink.samples.every(
        (sample) => sample.selectedMcsLabel === apexFrame.link.downlink.selectedMcs.label,
      ),
    ).toBe(true);
    expect(
      apexFrame.traffic.uplink.samples.every(
        (sample) => sample.selectedMcsLabel === apexFrame.link.uplink.selectedMcs.label,
      ),
    ).toBe(true);
  });

  test("accumulates backlog through outage seconds and tags oscillator-driven traffic failures", () => {
    const outageFrame = DEFAULT_SIMULATION_STATE.frames[32];
    const preOscillatorFaultFrame = DEFAULT_SIMULATION_STATE.frames[950];
    const oscillatorFaultFrame = DEFAULT_SIMULATION_STATE.frames[951];

    expect(outageFrame.hardware.steering.linkEnabled).toBe(false);
    expect(outageFrame.traffic.downlink.queueBacklogPackets).toBeGreaterThan(0);
    expect(outageFrame.traffic.downlink.goodputBps).toBe(0);
    expect(outageFrame.traffic.downlink.meanLatencySeconds).toBeNull();
    expect(outageFrame.traffic.downlink.packetLossFraction).toBe(1);

    expect(oscillatorFaultFrame.traffic.downlink.packetLossFraction).toBeGreaterThanOrEqual(
      preOscillatorFaultFrame.traffic.downlink.packetLossFraction,
    );
    expect(oscillatorFaultFrame.traffic.uplink.packetLossFraction).toBeGreaterThanOrEqual(
      preOscillatorFaultFrame.traffic.uplink.packetLossFraction,
    );
    expect(
      oscillatorFaultFrame.traffic.downlink.samples.some((sample) =>
        sample.reasonTags.includes("freq_error"),
      ),
    ).toBe(true);
    expect(
      oscillatorFaultFrame.traffic.uplink.samples.some((sample) =>
        sample.reasonTags.includes("freq_error"),
      ),
    ).toBe(true);
  });

  test("keeps traffic outputs finite and bounded across the default simulation", () => {
    for (const frame of DEFAULT_SIMULATION_STATE.frames) {
      for (const direction of [frame.traffic.downlink, frame.traffic.uplink]) {
        expect(Number.isFinite(direction.offeredPacketRatePacketsPerSecond)).toBe(true);
        expect(Number.isFinite(direction.serviceRatePacketsPerSecond)).toBe(true);
        expect(Number.isFinite(direction.queueBacklogPackets)).toBe(true);
        expect(Number.isFinite(direction.goodputBps)).toBe(true);
        expect(direction.packetLossFraction).toBeGreaterThanOrEqual(0);
        expect(direction.packetLossFraction).toBeLessThanOrEqual(1);
        expect(Number.isInteger(direction.sampleCount)).toBe(true);
        expect(direction.sampleCount).toBe(direction.samples.length);

        if (direction.queueDelaySeconds !== null) {
          expect(Number.isFinite(direction.queueDelaySeconds)).toBe(true);
        }

        if (direction.meanLatencySeconds !== null) {
          expect(Number.isFinite(direction.meanLatencySeconds)).toBe(true);
        }

        if (direction.jitterSeconds !== null) {
          expect(Number.isFinite(direction.jitterSeconds)).toBe(true);
        }
      }
    }
  });
});
