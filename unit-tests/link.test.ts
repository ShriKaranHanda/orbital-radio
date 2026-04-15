import { describe, expect, test } from "bun:test";
import { DEFAULT_SIMULATION_STATE } from "../state";

describe("simulation link", () => {
  test("derives bidirectional link budgets and adaptive coding from hardware state", () => {
    const apexFrame = DEFAULT_SIMULATION_STATE.frames[726];

    expect(apexFrame.hardware.steering.linkEnabled).toBe(true);
    expect(apexFrame.link.downlink.isOperational).toBe(true);
    expect(apexFrame.link.uplink.isOperational).toBe(true);
    expect(apexFrame.link.downlink.selectedMcs.id).not.toBeNull();
    expect(apexFrame.link.uplink.selectedMcs.id).not.toBeNull();
    expect(apexFrame.link.downlink.scheduledPayloadRateBps).toBeGreaterThan(0);
    expect(apexFrame.link.uplink.scheduledPayloadRateBps).toBeGreaterThan(0);
    expect(apexFrame.link.downlink.effectiveSnrDb).toBeLessThan(
      apexFrame.link.downlink.rawSnrDb,
    );
    expect(apexFrame.link.uplink.effectiveSnrDb).toBeLessThan(
      apexFrame.link.uplink.rawSnrDb,
    );
    expect(apexFrame.link.downlink.eirpDbw).toBeCloseTo(
      apexFrame.hardware.powerAmplifier.appliedOutputPowerDbw +
        apexFrame.hardware.phasedArray.txGainDbi -
        apexFrame.hardware.rfFrontEnd.txLossDb -
        apexFrame.hardware.powerAmplifier.compressionLossDb,
      9,
    );
    expect(apexFrame.link.uplink.eirpDbw).toBeCloseTo(
      apexFrame.hardware.groundTerminal.txPowerDbw +
        apexFrame.hardware.groundTerminal.effectiveTxGainDbi -
        apexFrame.hardware.groundTerminal.txRfLossDb,
      9,
    );
  });

  test("propagates power and oscillator faults into the link impairments", () => {
    const prePowerFaultFrame = DEFAULT_SIMULATION_STATE.frames[769];
    const powerFaultFrame = DEFAULT_SIMULATION_STATE.frames[770];
    const preOscillatorFaultFrame = DEFAULT_SIMULATION_STATE.frames[950];
    const oscillatorFaultFrame = DEFAULT_SIMULATION_STATE.frames[951];

    expect(powerFaultFrame.hardware.activeFaults.map((fault) => fault.id)).toContain(
      "power-bus-derating",
    );
    expect(powerFaultFrame.link.downlink.eirpDbw).toBeLessThan(
      prePowerFaultFrame.link.downlink.eirpDbw,
    );

    expect(oscillatorFaultFrame.hardware.activeFaults.map((fault) => fault.id)).toContain(
      "oscillator-instability",
    );
    expect(oscillatorFaultFrame.link.downlink.evm.cfoSquared).toBeGreaterThan(
      preOscillatorFaultFrame.link.downlink.evm.cfoSquared * 100,
    );
    expect(oscillatorFaultFrame.link.uplink.evm.cfoSquared).toBeGreaterThan(
      preOscillatorFaultFrame.link.uplink.evm.cfoSquared * 100,
    );
  });

  test("keeps link outputs finite and bounded across the default simulation", () => {
    for (const frame of DEFAULT_SIMULATION_STATE.frames) {
      expect(Number.isFinite(frame.link.downlink.eirpDbw)).toBe(true);
      expect(Number.isFinite(frame.link.downlink.noisePowerDbw)).toBe(true);
      expect(Number.isFinite(frame.link.downlink.effectiveSnrDb)).toBe(true);
      expect(Number.isFinite(frame.link.uplink.effectiveSnrDb)).toBe(true);
      expect(Number.isFinite(frame.link.downlink.evm.totalSquared)).toBe(true);
      expect(Number.isFinite(frame.link.uplink.evm.totalSquared)).toBe(true);
      expect(frame.link.downlink.ber).toBeGreaterThanOrEqual(0);
      expect(frame.link.downlink.ber).toBeLessThanOrEqual(1);
      expect(frame.link.uplink.ber).toBeGreaterThanOrEqual(0);
      expect(frame.link.uplink.ber).toBeLessThanOrEqual(1);
      expect(frame.link.downlink.per).toBeGreaterThanOrEqual(0);
      expect(frame.link.downlink.per).toBeLessThanOrEqual(1);
      expect(frame.link.uplink.per).toBeGreaterThanOrEqual(0);
      expect(frame.link.uplink.per).toBeLessThanOrEqual(1);
    }
  });
});
