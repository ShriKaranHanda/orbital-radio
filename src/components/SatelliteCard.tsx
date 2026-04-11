import type { SatelliteFrameState, SimulationHardwareState } from "../../state";
import { X } from "lucide-react";
import type { Satellite } from "../types";
import {
  formatDb,
  formatTimestamp,
  formatPercent,
  formatPowerDbw,
  formatPowerWatts,
  formatSeconds,
  formatSignedDb,
  formatTemperatureC,
  formatVectorMeters,
  formatVectorMetersPerSecond,
  formatFrequencyHz,
  formatDegrees,
} from "./formatters";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

type SatelliteCardProps = {
  satellite: Satellite;
  currentUnixMs: number;
  frameState: SatelliteFrameState;
  hardwareState: SimulationHardwareState;
  onClose: () => void;
};

export function SatelliteCard({
  satellite,
  currentUnixMs,
  frameState,
  hardwareState,
  onClose,
}: SatelliteCardProps) {
  return (
    <Card className="satellite-card">
      <CardHeader>
        <div className="card-title-group">
          <CardDescription>Satellite</CardDescription>
          <CardTitle>{satellite.name}</CardTitle>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </CardHeader>
      <CardContent>
        <div className="metric-grid">
          <Metric label="Catalog number" value={String(satellite.tle.satelliteCatalogNumber)} />
          <Metric label="Epoch year" value={String(satellite.tle.epoch.year)} />
          <Metric label="ECI speed" value={formatVelocityMagnitude(frameState.velocityEciMps)} />
          <Metric label="ECEF speed" value={formatVelocityMagnitude(frameState.velocityEcefMps)} />
          <Metric label="Steering" value={formatDegrees(hardwareState.steering.steeringAngleDeg)} />
          <Metric label="Array gain" value={`${hardwareState.phasedArray.arrayGainDbi.toFixed(1)} dBi`} />
          <Metric label="PA output" value={formatPowerDbw(hardwareState.powerAmplifier.appliedOutputPowerDbw)} />
          <Metric label="Dominant cause" value={formatReasonTag(hardwareState.reason.dominantTag)} />
        </div>

        <Accordion
          type="multiple"
          defaultValue={[
            "identity",
            "orbit",
            "ecef",
            "steering",
            "array",
            "rf",
            "power",
            "thermal",
            "faults",
          ]}
          className="accordion"
        >
          <AccordionItem value="identity">
            <AccordionTrigger>Identity</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail label="Timestamp" value={formatTimestamp(currentUnixMs)} />
                <Detail label="Name" value={satellite.tle.name} />
                <Detail label="Catalog number" value={String(satellite.tle.satelliteCatalogNumber)} />
                <Detail label="Classification" value={satellite.tle.classification} />
                <Detail
                  label="International designator"
                  value={formatInternationalDesignator(satellite)}
                />
                <Detail
                  label="Epoch day"
                  value={`${satellite.tle.epoch.dayOfYear}.${Math.round(satellite.tle.epoch.fractionalDay * 1_000_000)
                    .toString()
                    .padStart(6, "0")}`}
                />
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="orbit">
            <AccordionTrigger>Orbit Elements</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail label="Inclination" value={`${satellite.tle.inclinationDeg.toFixed(4)}°`} />
                <Detail
                  label="RAAN"
                  value={`${satellite.tle.rightAscensionAscendingNodeDeg.toFixed(4)}°`}
                />
                <Detail label="Eccentricity" value={satellite.tle.eccentricity.toFixed(7)} />
                <Detail
                  label="Arg of perigee"
                  value={`${satellite.tle.argumentOfPerigeeDeg.toFixed(4)}°`}
                />
                <Detail
                  label="Mean anomaly"
                  value={`${satellite.tle.meanAnomalyDeg.toFixed(4)}°`}
                />
                <Detail
                  label="Mean motion"
                  value={`${satellite.tle.meanMotionRevsPerDay.toFixed(8)} rev/day`}
                />
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="eci">
            <AccordionTrigger>ECI State</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail label="Position" value={formatVectorMeters(frameState.positionEciM)} />
                <Detail label="Velocity" value={formatVectorMetersPerSecond(frameState.velocityEciMps)} />
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="ecef">
            <AccordionTrigger>ECEF State</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail label="Position" value={formatVectorMeters(frameState.positionEcefM)} />
                <Detail label="Velocity" value={formatVectorMetersPerSecond(frameState.velocityEcefMps)} />
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="steering">
            <AccordionTrigger>Steering And Timing</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail
                  label="Steering angle"
                  value={formatDegrees(hardwareState.steering.steeringAngleDeg)}
                />
                <Detail
                  label="Field of regard"
                  value={formatDegrees(hardwareState.steering.fieldOfRegardDeg)}
                />
                <Detail
                  label="FOR clear"
                  value={hardwareState.steering.clearsFieldOfRegard ? "Yes" : "No"}
                />
                <Detail
                  label="Link enabled"
                  value={hardwareState.steering.linkEnabled ? "Yes" : "No"}
                />
                <Detail
                  label="Oscillator offset"
                  value={formatFrequencyHz(hardwareState.oscillator.absoluteOffsetHz)}
                />
                <Detail
                  label="Downlink residual"
                  value={formatFrequencyHz(hardwareState.oscillator.downlinkResidualHz)}
                />
                <Detail
                  label="Uplink residual"
                  value={formatFrequencyHz(hardwareState.oscillator.uplinkResidualHz)}
                />
                <Detail
                  label="Schedule lag"
                  value={`${hardwareState.oscillator.scheduleLagFrames} frames`}
                />
                <Detail
                  label="Timing jitter"
                  value={formatSeconds(hardwareState.oscillator.timingJitterSeconds)}
                />
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="array">
            <AccordionTrigger>Phased Array</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail
                  label="Active elements"
                  value={Math.round(hardwareState.phasedArray.activeElementCount).toString()}
                />
                <Detail
                  label="Degraded fraction"
                  value={formatPercent(hardwareState.phasedArray.degradedElementFraction)}
                />
                <Detail
                  label="Ideal gain"
                  value={`${hardwareState.phasedArray.idealGainDbi.toFixed(2)} dBi`}
                />
                <Detail
                  label="Array gain"
                  value={`${hardwareState.phasedArray.arrayGainDbi.toFixed(2)} dBi`}
                />
                <Detail
                  label="TX gain"
                  value={`${hardwareState.phasedArray.txGainDbi.toFixed(2)} dBi`}
                />
                <Detail
                  label="RX gain"
                  value={`${hardwareState.phasedArray.rxGainDbi.toFixed(2)} dBi`}
                />
                <Detail
                  label="Scan loss"
                  value={formatDb(hardwareState.phasedArray.scanLossDb)}
                />
                <Detail
                  label="Phase loss"
                  value={formatDb(hardwareState.phasedArray.phaseLossDb)}
                />
                <Detail
                  label="Thermal loss"
                  value={formatDb(hardwareState.phasedArray.thermalLossDb)}
                />
                <Detail
                  label="Pointing loss"
                  value={formatDb(hardwareState.phasedArray.pointingLossDb)}
                />
                <Detail
                  label="Beamwidth"
                  value={formatDegrees(hardwareState.phasedArray.beamwidthDeg)}
                />
                <Detail
                  label="Beam quality"
                  value={formatPercent(hardwareState.phasedArray.beamQuality)}
                />
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="rf">
            <AccordionTrigger>RF Front End</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail
                  label="TX RF loss"
                  value={formatDb(hardwareState.rfFrontEnd.txLossDb)}
                />
                <Detail
                  label="Noise figure"
                  value={formatDb(hardwareState.rfFrontEnd.noiseFigureDb)}
                />
                <Detail
                  label="Satellite RX NF"
                  value={formatDb(hardwareState.rfFrontEnd.satelliteRxNoiseFigureDb)}
                />
                <Detail
                  label="Ground RX gain"
                  value={`${hardwareState.groundTerminal.effectiveRxGainDbi.toFixed(2)} dBi`}
                />
                <Detail
                  label="Ground TX gain"
                  value={`${hardwareState.groundTerminal.effectiveTxGainDbi.toFixed(2)} dBi`}
                />
                <Detail
                  label="Ground pointing loss"
                  value={formatDb(hardwareState.groundTerminal.pointingLossDb)}
                />
                <Detail
                  label="Ground RX NF"
                  value={formatDb(hardwareState.groundTerminal.rxNoiseFigureDb)}
                />
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="power">
            <AccordionTrigger>PA, Power, And Compute</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail
                  label="Requested PA output"
                  value={formatPowerDbw(hardwareState.powerAmplifier.requestedOutputPowerDbw)}
                />
                <Detail
                  label="Applied PA output"
                  value={formatPowerDbw(hardwareState.powerAmplifier.appliedOutputPowerDbw)}
                />
                <Detail
                  label="PA limit"
                  value={formatPowerDbw(hardwareState.powerAmplifier.limitedOutputPowerDbw)}
                />
                <Detail
                  label="Backoff"
                  value={formatDb(hardwareState.powerAmplifier.inputBackoffDb)}
                />
                <Detail
                  label="Compression loss"
                  value={formatDb(hardwareState.powerAmplifier.compressionLossDb)}
                />
                <Detail
                  label="Efficiency"
                  value={formatPercent(hardwareState.powerAmplifier.efficiency)}
                />
                <Detail
                  label="RF output"
                  value={formatPowerWatts(hardwareState.powerAmplifier.rfOutputPowerW)}
                />
                <Detail
                  label="PA DC draw"
                  value={formatPowerWatts(hardwareState.powerAmplifier.dcDrawW)}
                />
                <Detail
                  label="Bus penalty"
                  value={formatSignedDb(hardwareState.powerAmplifier.busPenaltyDb)}
                />
                <Detail
                  label="Battery state"
                  value={formatPercent(hardwareState.powerBus.batterySoc)}
                />
                <Detail
                  label="Available power"
                  value={formatPowerWatts(hardwareState.powerBus.availablePowerW)}
                />
                <Detail
                  label="Load power"
                  value={formatPowerWatts(hardwareState.powerBus.loadPowerW)}
                />
                <Detail
                  label="Power shedding"
                  value={formatPercent(hardwareState.powerBus.sheddingFactor)}
                />
                <Detail
                  label="Compute utilization"
                  value={formatPercent(hardwareState.compute.utilization)}
                />
                <Detail
                  label="Schedule delay"
                  value={formatSeconds(hardwareState.compute.scheduleDelaySeconds)}
                />
                <Detail
                  label="Compute power"
                  value={formatPowerWatts(hardwareState.compute.powerDrawW)}
                />
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="thermal">
            <AccordionTrigger>Thermal State</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail
                  label="Array temperature"
                  value={formatTemperatureC(hardwareState.thermal.arrayTempC)}
                />
                <Detail
                  label="PA temperature"
                  value={formatTemperatureC(hardwareState.thermal.paTempC)}
                />
                <Detail
                  label="RF temperature"
                  value={formatTemperatureC(hardwareState.thermal.rfTempC)}
                />
                <Detail
                  label="Oscillator temperature"
                  value={formatTemperatureC(hardwareState.thermal.oscillatorTempC)}
                />
                <Detail
                  label="Sun exposure"
                  value={formatPercent(hardwareState.thermal.sunExposure)}
                />
                <Detail
                  label="Solar generation"
                  value={formatPowerWatts(hardwareState.thermal.solarGenerationW)}
                />
                <Detail
                  label="Thermal-control load"
                  value={formatPowerWatts(hardwareState.thermal.thermalControlPowerW)}
                />
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="faults">
            <AccordionTrigger>Faults And Explainability</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail
                  label="Active faults"
                  value={
                    hardwareState.activeFaults.length > 0
                      ? hardwareState.activeFaults.map((fault) => fault.label).join(", ")
                      : "None"
                  }
                />
                <Detail
                  label="Dominant cause"
                  value={formatReasonTag(hardwareState.reason.dominantTag)}
                />
                <Detail
                  label="Active tags"
                  value={
                    hardwareState.reason.activeTags.length > 0
                      ? hardwareState.reason.activeTags.map(formatReasonTag).join(", ")
                      : "None"
                  }
                />
                <Detail
                  label="Array score"
                  value={hardwareState.reason.scores.array_scan_loss.toFixed(2)}
                />
                <Detail
                  label="Frequency score"
                  value={hardwareState.reason.scores.freq_error.toFixed(2)}
                />
                <Detail
                  label="PA score"
                  value={hardwareState.reason.scores.pa_backoff.toFixed(2)}
                />
                <Detail
                  label="Thermal score"
                  value={hardwareState.reason.scores.thermal_throttle.toFixed(2)}
                />
                <Detail
                  label="Compute score"
                  value={hardwareState.reason.scores.compute_overload.toFixed(2)}
                />
                <Detail
                  label="Power score"
                  value={hardwareState.reason.scores.power_limited.toFixed(2)}
                />
              </dl>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function formatInternationalDesignator(satellite: Satellite) {
  const { launchYear, launchNumberOfYear, launchPiece } = satellite.tle.internationalDesignator;
  return `${launchYear}-${String(launchNumberOfYear).padStart(3, "0")}${launchPiece}`;
}

function formatVelocityMagnitude(vector: { x: number; y: number; z: number }) {
  return `${Math.hypot(vector.x, vector.y, vector.z).toFixed(1)} m/s`;
}

function formatReasonTag(value: SimulationHardwareState["reason"]["dominantTag"]) {
  if (!value) {
    return "Nominal";
  }

  return value.replaceAll("_", " ");
}
