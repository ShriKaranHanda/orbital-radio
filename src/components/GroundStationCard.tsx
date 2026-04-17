import type {
  GroundStationDerivedState,
  SimulationHardwareState,
  SimulationLinkState,
  SimulationTrafficDirectionState,
  SimulationTrafficState,
  TrafficTraceSample,
} from "../../state";
import { X } from "lucide-react";
import { formatCoordinate } from "../lib/geo";
import type { GroundStation } from "../types";
import {
  formatAzimuth,
  formatBitRate,
  formatDb,
  formatDegrees,
  formatDistanceMeters,
  formatFrequencyHz,
  formatPacketRate,
  formatPacketCount,
  formatPercent,
  formatProbability,
  formatPowerDbw,
  formatSeconds,
  formatSignedDegrees,
  formatSpeedMetersPerSecond,
  formatTimestamp,
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

type GroundStationCardProps = {
  station: GroundStation;
  currentUnixMs: number;
  derivedState: GroundStationDerivedState;
  hardwareState: SimulationHardwareState;
  linkState: SimulationLinkState;
  trafficState: SimulationTrafficState;
  onClose: () => void;
};

export function GroundStationCard({
  station,
  currentUnixMs,
  derivedState,
  hardwareState,
  linkState,
  trafficState,
  onClose,
}: GroundStationCardProps) {
  return (
    <Card className="station-card">
      <CardHeader>
        <div className="card-title-group">
          <CardDescription>Ground station</CardDescription>
          <CardTitle>{station.name}</CardTitle>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </CardHeader>
      <CardContent>
        <div className="metric-grid">
          <Metric label="Look azimuth" value={formatDegrees(derivedState.azimuthDeg)} />
          <Metric label="Look elevation" value={formatDegrees(derivedState.elevationDeg)} />
          <Metric label="Slant range" value={formatDistanceMeters(derivedState.slantRangeM)} />
          <Metric label="Range rate" value={formatSpeedMetersPerSecond(derivedState.rangeRateMps)} />
          <Metric label="RX gain" value={`${hardwareState.groundTerminal.effectiveRxGainDbi.toFixed(1)} dBi`} />
          <Metric label="DL eff SNR" value={formatDb(linkState.downlink.effectiveSnrDb)} />
          <Metric label="UL eff SNR" value={formatDb(linkState.uplink.effectiveSnrDb)} />
          <Metric label="DL MCS" value={formatMcs(linkState.downlink)} />
          <Metric label="UL MCS" value={formatMcs(linkState.uplink)} />
          <Metric label="DL goodput" value={formatBitRate(trafficState.downlink.goodputBps)} />
          <Metric label="UL goodput" value={formatBitRate(trafficState.uplink.goodputBps)} />
          <Metric label="DL loss" value={formatPercent(trafficState.downlink.packetLossFraction)} />
          <Metric label="UL loss" value={formatPercent(trafficState.uplink.packetLossFraction)} />
          <Metric label="Pass state" value={derivedState.inPass ? "In pass" : "Out of pass"} />
        </div>

        <Accordion
          type="multiple"
          defaultValue={[
            "location",
            "visibility",
            "pass",
            "antenna",
            "geometry",
            "terminal",
            "link",
            "traffic",
            "trace",
          ]}
          className="accordion"
        >
          <AccordionItem value="location">
            <AccordionTrigger>Location</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail label="Timestamp" value={formatTimestamp(currentUnixMs)} />
                <Detail label="Latitude" value={formatCoordinate(station.latDeg, "N", "S")} />
                <Detail label="Longitude" value={formatCoordinate(station.lonDeg, "E", "W")} />
                <Detail label="Altitude" value={`${station.altitudeM.toLocaleString()} m`} />
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="visibility">
            <AccordionTrigger>Visibility Constraints</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail label="Min elevation" value={formatDegrees(station.minElevationDeg)} />
                <Detail
                  label="Mask at look azimuth"
                  value={formatDegrees(derivedState.horizonMaskElevationDeg)}
                />
                <Detail
                  label="Required elevation"
                  value={formatDegrees(derivedState.requiredElevationDeg)}
                />
                <Detail
                  label="Above horizon"
                  value={derivedState.isAboveGeometricHorizon ? "Yes" : "No"}
                />
                <Detail
                  label="Clears mask"
                  value={derivedState.clearsOperationalMask ? "Yes" : "No"}
                />
                <Detail label="In pass" value={derivedState.inPass ? "Yes" : "No"} />
                <Detail
                  label="Mask samples"
                  value={String(station.horizonMask.length)}
                />
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="pass">
            <AccordionTrigger>Pass Window</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail label="kIn" value={formatFrameIndex(derivedState.kIn)} />
                <Detail label="kApex" value={formatFrameIndex(derivedState.kApex)} />
                <Detail label="kOut" value={formatFrameIndex(derivedState.kOut)} />
                <Detail
                  label="Pass duration"
                  value={formatDurationSeconds(derivedState.passDurationSeconds)}
                />
                <Detail label="Frame status" value={derivedState.inPass ? "Within window" : "Outside window"} />
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="antenna">
            <AccordionTrigger>Antenna Setup</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail label="Mount type" value={station.antenna.mountType} />
                <Detail label="Pointing mode" value={station.antenna.pointingMode} />
                <Detail
                  label="Antenna azimuth"
                  value={formatAzimuth(station.antenna.azimuthDeg)}
                />
                <Detail
                  label="Antenna elevation"
                  value={formatDegrees(station.antenna.elevationDeg)}
                />
                <Detail
                  label="Dish diameter"
                  value={`${station.antenna.dishDiameterM.toFixed(1)} m`}
                />
                <Detail label="Gain" value={`${station.antenna.gainDbi.toFixed(1)} dBi`} />
                <Detail label="Polarization" value={station.antenna.polarization} />
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="geometry">
            <AccordionTrigger>Satellite Geometry</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail
                  label="Look azimuth"
                  value={formatAzimuth(derivedState.azimuthDeg)}
                />
                <Detail label="Elevation" value={formatDegrees(derivedState.elevationDeg)} />
                <Detail
                  label="Commanded azimuth"
                  value={formatAzimuth(derivedState.commandedAzimuthDeg)}
                />
                <Detail
                  label="Commanded elevation"
                  value={formatDegrees(derivedState.commandedElevationDeg)}
                />
                <Detail
                  label="Tracked azimuth"
                  value={formatAzimuth(derivedState.trackedAzimuthDeg)}
                />
                <Detail
                  label="Tracked elevation"
                  value={formatDegrees(derivedState.trackedElevationDeg)}
                />
                <Detail
                  label="Slant range"
                  value={formatDistanceMeters(derivedState.slantRangeM)}
                />
                <Detail
                  label="Range rate"
                  value={formatSpeedMetersPerSecond(derivedState.rangeRateMps)}
                />
                <Detail
                  label="Downlink Doppler"
                  value={formatFrequencyHz(derivedState.downlinkDopplerShiftHz)}
                />
                <Detail
                  label="Uplink Doppler"
                  value={formatFrequencyHz(derivedState.uplinkDopplerShiftHz)}
                />
                <Detail
                  label="Azimuth error"
                  value={formatSignedDegrees(derivedState.pointingAzimuthErrorDeg)}
                />
                <Detail
                  label="Elevation error"
                  value={formatSignedDegrees(derivedState.pointingElevationErrorDeg)}
                />
                <Detail
                  label="Pointing separation"
                  value={formatDegrees(derivedState.pointingSeparationDeg)}
                />
              </dl>
              <p className="detail-note">
                Azimuth is measured from local north and increases clockwise toward east.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="terminal">
            <AccordionTrigger>Terminal Hardware</AccordionTrigger>
            <AccordionContent>
              <dl className="detail-list">
                <Detail
                  label="TX power"
                  value={formatPowerDbw(hardwareState.groundTerminal.txPowerDbw)}
                />
                <Detail
                  label="TX RF loss"
                  value={formatDb(hardwareState.groundTerminal.txRfLossDb)}
                />
                <Detail
                  label="Effective RX gain"
                  value={`${hardwareState.groundTerminal.effectiveRxGainDbi.toFixed(2)} dBi`}
                />
                <Detail
                  label="Effective TX gain"
                  value={`${hardwareState.groundTerminal.effectiveTxGainDbi.toFixed(2)} dBi`}
                />
                <Detail
                  label="Pointing loss"
                  value={formatDb(hardwareState.groundTerminal.pointingLossDb)}
                />
                <Detail
                  label="RX noise figure"
                  value={formatDb(hardwareState.groundTerminal.rxNoiseFigureDb)}
                />
                <Detail
                  label="Reference offset"
                  value={formatFrequencyHz(hardwareState.groundTerminal.referenceOffsetHz)}
                />
                <Detail
                  label="TX EVM"
                  value={formatPercent(hardwareState.groundTerminal.txEvmRms)}
                />
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="link">
            <AccordionTrigger>Link Budget</AccordionTrigger>
            <AccordionContent>
              <LinkBudgetDirectionDetails
                label="Downlink"
                direction={linkState.downlink}
              />
              <LinkBudgetDirectionDetails
                label="Uplink"
                direction={linkState.uplink}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="traffic">
            <AccordionTrigger>Traffic And Queues</AccordionTrigger>
            <AccordionContent>
              <TrafficDirectionDetails
                label="Downlink"
                direction={trafficState.downlink}
              />
              <TrafficDirectionDetails
                label="Uplink"
                direction={trafficState.uplink}
              />
              <p className="detail-note">
                Queue delay is computed from backlog at the start of this second. Each sampled
                packet represents a bounded deterministic slice of the offered load.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="trace">
            <AccordionTrigger>Packet Trace</AccordionTrigger>
            <AccordionContent>
              <PacketTraceSection
                label="Downlink"
                samples={trafficState.downlink.samples}
                meanLatencySeconds={trafficState.downlink.meanLatencySeconds}
              />
              <PacketTraceSection
                label="Uplink"
                samples={trafficState.uplink.samples}
                meanLatencySeconds={trafficState.uplink.meanLatencySeconds}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function TrafficDirectionDetails({
  label,
  direction,
}: {
  label: string;
  direction: SimulationTrafficDirectionState;
}) {
  return (
    <div className="traffic-direction-details">
      <p className="traffic-direction-heading trace-heading">{label}</p>
      <dl className="detail-list">
        <Detail label="Offered load" value={`${direction.offeredLoadMbps.toFixed(1)} Mbps`} />
        <Detail
          label="Packet size"
          value={`${direction.packetSizeBytes.toLocaleString()} bytes`}
        />
        <Detail
          label="Offered rate"
          value={formatPacketRate(direction.offeredPacketRatePacketsPerSecond)}
        />
        <Detail
          label="Service rate"
          value={formatPacketRate(direction.serviceRatePacketsPerSecond)}
        />
        <Detail
          label="Queue backlog"
          value={formatPacketCount(direction.queueBacklogPackets)}
        />
        <Detail
          label="Queue delay"
          value={formatNullableSeconds(direction.queueDelaySeconds)}
        />
        <Detail
          label="Propagation delay"
          value={formatSeconds(direction.propagationDelaySeconds)}
        />
        <Detail
          label="Retransmission wait"
          value={formatSeconds(direction.retransmissionDelaySeconds)}
        />
        <Detail label="Samples" value={String(direction.sampleCount)} />
        <Detail
          label="Packets per sample"
          value={formatPacketCount(direction.sampleWeightPackets)}
        />
        <Detail
          label="Packet loss"
          value={formatPercent(direction.packetLossFraction)}
        />
        <Detail
          label="Retransmissions"
          value={formatPacketCount(direction.weightedRetransmissions)}
        />
        <Detail label="Goodput" value={formatBitRate(direction.goodputBps)} />
        <Detail
          label="Mean latency"
          value={formatNullableSeconds(direction.meanLatencySeconds)}
        />
        <Detail
          label="Jitter"
          value={formatNullableSeconds(direction.jitterSeconds)}
        />
        <Detail label="Max attempts" value={String(direction.maxAttempts)} />
      </dl>
    </div>
  );
}

function LinkBudgetDirectionDetails({
  label,
  direction,
}: {
  label: string;
  direction: SimulationLinkState["downlink"];
}) {
  return (
    <div className="traffic-direction-details">
      <p className="traffic-direction-heading trace-heading">{label}</p>
      <dl className="detail-list">
        <Detail label="Operational" value={direction.isOperational ? "Yes" : "No"} />
        <Detail label="EIRP" value={formatPowerDbw(direction.eirpDbw)} />
        <Detail label="RX power" value={formatPowerDbw(direction.receivePowerDbw)} />
        <Detail label="Raw SNR" value={formatDb(direction.rawSnrDb)} />
        <Detail label="Eff SNR" value={formatDb(direction.effectiveSnrDb)} />
        <Detail label="MCS" value={formatMcs(direction)} />
        <Detail label="BER" value={formatProbability(direction.ber)} />
        <Detail label="PER" value={formatProbability(direction.per)} />
        <Detail
          label="Payload rate"
          value={formatBitRate(direction.scheduledPayloadRateBps)}
        />
        <Detail
          label="Packet rate"
          value={formatPacketRate(direction.serviceRatePacketsPerSecond)}
        />
        <Detail label="EVM" value={formatPercent(direction.evm.rms)} />
      </dl>
    </div>
  );
}

function PacketTraceSection({
  label,
  samples,
  meanLatencySeconds,
}: {
  label: string;
  samples: readonly TrafficTraceSample[];
  meanLatencySeconds: number | null;
}) {
  return (
    <section className="trace-section" aria-label={`${label} packet traces`}>
      <div className="trace-section-header">
        <p className="trace-heading">{label}</p>
        <span className="trace-summary">
          Mean latency {formatNullableSeconds(meanLatencySeconds)}
        </span>
      </div>
      {samples.length === 0 ? (
        <p className="detail-note">No offered packets in this second.</p>
      ) : (
        <div className="trace-list">
          {samples.map((sample) => (
            <article
              key={sample.id}
              className={`trace-row${sample.dropped ? " is-drop" : ""}`}
            >
              <div className="trace-row-header">
                <strong>{formatTimestamp(sample.timestampUnixMs)}</strong>
                <span className={`trace-outcome${sample.dropped ? " is-drop" : ""}`}>
                  {sample.dropped ? "Dropped" : "Delivered"}
                </span>
              </div>
              <div className="trace-meta">
                <span>{sample.selectedMcsLabel ?? "Outage"}</span>
                <span>{formatPacketCount(sample.representedPackets)} pkts</span>
                <span>
                  {sample.retransmissions > 0
                    ? `Retx ${sample.retransmissions}`
                    : "First try"}
                </span>
                <span>Attempts {sample.attempts}</span>
                <span>Latency {formatNullableSeconds(sample.latencySeconds)}</span>
                <span>
                  Delta {formatSignedSeconds(sample.latencyJitterSeconds)}
                </span>
              </div>
              <div className="trace-tags">
                {sample.reasonTags.length > 0 ? (
                  sample.reasonTags.map((tag) => (
                    <span key={`${sample.id}-${tag}`} className="trace-tag">
                      {formatTraceReasonTag(tag)}
                    </span>
                  ))
                ) : (
                  <span className="trace-tag">clean</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
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

function formatFrameIndex(value: number | null) {
  return value === null ? "N/A" : String(value);
}

function formatDurationSeconds(value: number) {
  return `${value.toFixed(0)} s`;
}

function formatMcs(direction: SimulationLinkState["downlink"]) {
  return direction.selectedMcs.label ?? "Outage";
}

function formatNullableSeconds(value: number | null) {
  return value === null ? "Outage" : formatSeconds(value);
}

function formatSignedSeconds(value: number | null) {
  if (value === null) {
    return "N/A";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatSeconds(Math.abs(value))}`;
}

function formatTraceReasonTag(value: TrafficTraceSample["reasonTags"][number]) {
  return value.replaceAll("_", " ");
}
