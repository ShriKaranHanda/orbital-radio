import { describe, expect, test } from "bun:test";
import { DEFAULT_SIMULATION_STATE } from "../state";

describe("simulation hardware", () => {
  test("gates the link by pass visibility and satellite field of regard", () => {
    const firstInPassFrame = DEFAULT_SIMULATION_STATE.frames[518];
    const apexFrame = DEFAULT_SIMULATION_STATE.frames[726];
    const lastInPassFrame = DEFAULT_SIMULATION_STATE.frames[1001];

    expect(firstInPassFrame.groundStation.inPass).toBe(true);
    expect(firstInPassFrame.hardware.steering.clearsFieldOfRegard).toBe(false);
    expect(firstInPassFrame.hardware.steering.linkEnabled).toBe(false);
    expect(apexFrame.hardware.steering.clearsFieldOfRegard).toBe(true);
    expect(apexFrame.hardware.steering.linkEnabled).toBe(true);
    expect(lastInPassFrame.groundStation.inPass).toBe(true);
    expect(lastInPassFrame.hardware.steering.clearsFieldOfRegard).toBe(false);
    expect(lastInPassFrame.hardware.steering.linkEnabled).toBe(false);
  });

  test("surfaces distinct hardware causes during the configured fault windows", () => {
    const arrayFaultFrame = DEFAULT_SIMULATION_STATE.frames[443];
    const computeFaultFrame = DEFAULT_SIMULATION_STATE.frames[640];
    const powerFaultFrame = DEFAULT_SIMULATION_STATE.frames[770];
    const oscillatorFaultFrame = DEFAULT_SIMULATION_STATE.frames[951];

    expect(arrayFaultFrame.hardware.activeFaults.map((fault) => fault.id)).toContain(
      "array-tile-degradation",
    );
    expect(arrayFaultFrame.hardware.phasedArray.degradedElementFraction).toBeGreaterThan(0.1);
    expect(arrayFaultFrame.hardware.reason.dominantTag).toBe("array_scan_loss");

    expect(computeFaultFrame.hardware.activeFaults.map((fault) => fault.id)).toContain(
      "compute-overload",
    );
    expect(computeFaultFrame.hardware.compute.scheduleDelaySeconds).toBeGreaterThan(0.2);
    expect(computeFaultFrame.hardware.oscillator.scheduleLagFrames).toBeGreaterThan(0);
    expect(computeFaultFrame.hardware.reason.dominantTag).toBe("compute_overload");

    expect(powerFaultFrame.hardware.activeFaults.map((fault) => fault.id)).toContain(
      "power-bus-derating",
    );
    expect(powerFaultFrame.hardware.powerAmplifier.busPenaltyDb).toBeGreaterThan(0.8);
    expect(powerFaultFrame.hardware.reason.dominantTag).toBe("power_limited");

    expect(oscillatorFaultFrame.hardware.activeFaults.map((fault) => fault.id)).toContain(
      "oscillator-instability",
    );
    expect(Math.abs(oscillatorFaultFrame.hardware.oscillator.downlinkResidualHz)).toBeGreaterThan(
      20_000,
    );
    expect(oscillatorFaultFrame.hardware.reason.activeTags).toContain("freq_error");
  });

  test("keeps hardware frame values finite across the default simulation", () => {
    for (const frame of DEFAULT_SIMULATION_STATE.frames) {
      expect(Number.isFinite(frame.hardware.steering.steeringAngleDeg)).toBe(true);
      expect(Number.isFinite(frame.hardware.phasedArray.arrayGainDbi)).toBe(true);
      expect(Number.isFinite(frame.hardware.powerAmplifier.appliedOutputPowerDbw)).toBe(true);
      expect(Number.isFinite(frame.hardware.oscillator.downlinkResidualHz)).toBe(true);
      expect(Number.isFinite(frame.hardware.thermal.arrayTempC)).toBe(true);
      expect(Number.isFinite(frame.hardware.powerBus.batterySoc)).toBe(true);
      expect(Number.isFinite(frame.hardware.compute.scheduleDelaySeconds)).toBe(true);
    }
  });
});
