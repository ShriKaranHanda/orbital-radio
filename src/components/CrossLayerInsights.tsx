import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import type { SimulationFrame } from "../../state";
import {
  formatBitRate,
  formatDb,
  formatDistanceMeters,
  formatFrequencyHz,
  formatPacketCount,
  formatPacketRate,
  formatPercent,
  formatProbability,
  formatSeconds,
  formatSpeedMetersPerSecond,
  formatTimestamp,
} from "./formatters";

type CrossLayerInsightsProps = {
  frames: readonly SimulationFrame[];
  pendingFrameIndex: number;
  visualFrameIndex: number;
  onFrameInput: (frameIndex: number) => void;
};

type MetricSeries = {
  label: string;
  color: string;
  values: readonly number[];
  currentValue: number;
  formatValue: (value: number) => string;
};

type MetricLane = {
  id: string;
  title: string;
  scaleLabel: string;
  series: readonly MetricSeries[];
  normalizeValue: (value: number) => number;
};

type StripSegment = {
  startFrameIndex: number;
  endFrameIndex: number;
  color: string;
};

type PassMarker = {
  key: string;
  label: string;
  frameIndex: number;
};

const STRIP_WIDTH = 1_000;
const STRIP_HEIGHT = 18;
const LANE_WIDTH = 1_000;
const LANE_HEIGHT = 54;
const GRID_LINES = [0.2, 0.5, 0.8];
const DEFAULT_PANEL_WIDTH_FRACTION = 0.5;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 760;
const DIRECTION_COLORS = {
  downlink: "#67d2ff",
  uplink: "#5de0a4",
} as const;

export function CrossLayerInsights({
  frames,
  pendingFrameIndex,
  visualFrameIndex,
  onFrameInput,
}: CrossLayerInsightsProps) {
  const [panelWidth, setPanelWidth] = useState(() => getDefaultPanelWidth());
  const resizeStateRef = useRef<{ originX: number; originWidth: number } | null>(null);

  const frameCount = frames.length;
  const selectedFrame = frames[pendingFrameIndex] ?? null;
  const passMarkers = useMemo(() => buildPassMarkers(frames), [frames]);
  const laneData = useMemo(
    () => buildMetricLanes(frames, pendingFrameIndex),
    [frames, pendingFrameIndex],
  );
  const stripData = useMemo(() => buildStripRows(frames), [frames]);

  useEffect(() => {
    const clampToViewport = () => {
      if (window.innerWidth <= 720) {
        return;
      }

      setPanelWidth((currentWidth) =>
        clampPanelWidth(
          currentWidth,
          Math.min(
            MAX_PANEL_WIDTH,
            window.innerWidth - getPageGutter() * 2,
          ),
        ),
      );
    };

    clampToViewport();
    window.addEventListener("resize", clampToViewport);

    return () => {
      window.removeEventListener("resize", clampToViewport);
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const viewportMaxWidth = Math.min(
        MAX_PANEL_WIDTH,
        window.innerWidth - getPageGutter() * 2,
      );
      const nextWidth =
        resizeState.originWidth + (event.clientX - resizeState.originX);

      setPanelWidth(clampPanelWidth(nextWidth, viewportMaxWidth));
    };

    const handleMouseUp = () => {
      resizeStateRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleResizeMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth <= 720) {
      return;
    }

    resizeStateRef.current = {
      originX: event.clientX,
      originWidth: panelWidth,
    };
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (window.innerWidth <= 720) {
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();

    const delta = event.key === "ArrowRight" ? 24 : -24;
    const viewportMaxWidth = Math.min(
      MAX_PANEL_WIDTH,
      window.innerWidth - getPageGutter() * 2,
    );

    setPanelWidth((currentWidth) =>
      clampPanelWidth(currentWidth + delta, viewportMaxWidth),
    );
  };

  if (selectedFrame === null) {
    return null;
  }

  const selectedImpact = getImpactLabel(selectedFrame);
  const selectedTotalGoodputBps =
    selectedFrame.traffic.downlink.goodputBps + selectedFrame.traffic.uplink.goodputBps;
  const selectedMaxLossFraction = Math.max(
    selectedFrame.traffic.downlink.packetLossFraction,
    selectedFrame.traffic.uplink.packetLossFraction,
  );

  return (
    <section
      className="insights-panel"
      aria-label="Cross-layer analysis panel"
      style={{ "--insights-panel-width": `${panelWidth}px` } as CSSProperties}
    >
      <div
        className="insights-resize-handle"
        role="separator"
        aria-label="Resize analysis panel"
        aria-orientation="vertical"
        tabIndex={0}
        onMouseDown={handleResizeMouseDown}
        onKeyDown={handleResizeKeyDown}
      />

      <header className="insights-header">
        <div className="insights-title-group">
          <span className="insights-kicker">Cross-layer analysis</span>
          <h2 className="insights-title">Hardware causes to network impact</h2>
          <p className="insights-subtitle">
            Click or drag across any strip or lane to inspect a specific second.
          </p>
        </div>

        <div className="insights-chip-row">
          <StatusChip
            label={`Selected T+${selectedFrame.index}s`}
            value={formatTimestamp(selectedFrame.currentUnixMs)}
            color="#67d2ff"
          />
          <StatusChip
            label="Link"
            value={selectedFrame.hardware.steering.linkEnabled ? "Enabled" : "Outage"}
            color={selectedFrame.hardware.steering.linkEnabled ? "#34d399" : "#ef4444"}
          />
          <StatusChip
            label="Impact"
            value={selectedImpact}
            color={getImpactColor(selectedImpact)}
          />
          <StatusChip
            label="Range"
            value={formatDistanceMeters(selectedFrame.groundStation.slantRangeM)}
            color="#38bdf8"
          />
          <StatusChip
            label="Loss"
            value={formatPercent(selectedMaxLossFraction)}
            color="#fb7185"
          />
          <StatusChip
            label="Goodput"
            value={formatBitRate(selectedTotalGoodputBps)}
            color="#5de0a4"
          />
        </div>
      </header>

      <div className="insights-section">
        <div className="insights-section-header">
          <span>State strips</span>
          <small>
            Binary and discrete transitions that make failures obvious at a glance.
          </small>
        </div>

        <div className="strip-stack">
          {stripData.map((row) => (
            <StripRow
              key={row.id}
              label={row.label}
              value={row.getSelectedValue(selectedFrame)}
              segments={row.segments}
              passMarkers={passMarkers}
              frameCount={frameCount}
              pendingFrameIndex={pendingFrameIndex}
              visualFrameIndex={visualFrameIndex}
              onFrameInput={onFrameInput}
            />
          ))}
        </div>
      </div>

      <div className="insights-section">
        <div className="insights-section-header">
          <span>Metric lanes</span>
          <small>
            Ordered from upstream physical drivers down to delivered network outcomes.
          </small>
        </div>

        <div className="lane-stack">
          {laneData.map((lane) => (
            <MetricLaneRow
              key={lane.id}
              lane={lane}
              passMarkers={passMarkers}
              frameCount={frameCount}
              pendingFrameIndex={pendingFrameIndex}
              visualFrameIndex={visualFrameIndex}
              onFrameInput={onFrameInput}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function getDefaultPanelWidth() {
  const availableWidth = Math.max(
    MIN_PANEL_WIDTH,
    window.innerWidth - getPageGutter() * 2,
  );
  const viewportMaxWidth = Math.min(MAX_PANEL_WIDTH, availableWidth);
  return clampPanelWidth(
    Math.floor(availableWidth * DEFAULT_PANEL_WIDTH_FRACTION),
    viewportMaxWidth,
  );
}

function clampPanelWidth(width: number, maxWidth: number) {
  return Math.min(Math.max(width, MIN_PANEL_WIDTH), Math.max(MIN_PANEL_WIDTH, maxWidth));
}

function getPageGutter() {
  const rootStyles = getComputedStyle(document.documentElement);
  const pageGutter = Number.parseFloat(rootStyles.getPropertyValue("--page-gutter"));
  return Number.isFinite(pageGutter) ? pageGutter : 16;
}

type StripRowProps = {
  label: string;
  value: string;
  segments: readonly StripSegment[];
  passMarkers: readonly PassMarker[];
  frameCount: number;
  pendingFrameIndex: number;
  visualFrameIndex: number;
  onFrameInput: (frameIndex: number) => void;
};

function StripRow({
  label,
  value,
  segments,
  passMarkers,
  frameCount,
  pendingFrameIndex,
  visualFrameIndex,
  onFrameInput,
}: StripRowProps) {
  return (
    <div className="strip-row">
      <div className="strip-row-header">
        <span className="strip-row-label">{label}</span>
        <span className="strip-row-value">{value}</span>
      </div>

      <svg
        className="strip-svg"
        viewBox={`0 0 ${STRIP_WIDTH} ${STRIP_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        onPointerDown={(event) =>
          onFrameInput(getFrameIndexFromPointer(event, frameCount))
        }
        onPointerMove={(event) => {
          if ((event.buttons & 1) === 1) {
            onFrameInput(getFrameIndexFromPointer(event, frameCount));
          }
        }}
      >
        <rect
          x={0}
          y={0}
          width={STRIP_WIDTH}
          height={STRIP_HEIGHT}
          rx={6}
          fill="rgba(6, 10, 18, 0.84)"
        />
        {segments.map((segment, index) => (
          <rect
            key={`${segment.startFrameIndex}-${segment.endFrameIndex}-${index}`}
            x={frameBucketToX(segment.startFrameIndex, STRIP_WIDTH, frameCount)}
            y={0}
            width={Math.max(
              frameBucketToX(segment.endFrameIndex + 1, STRIP_WIDTH, frameCount) -
                frameBucketToX(segment.startFrameIndex, STRIP_WIDTH, frameCount),
              1,
            )}
            height={STRIP_HEIGHT}
            fill={segment.color}
          />
        ))}
        {passMarkers.map((marker) => (
          <line
            key={marker.key}
            x1={framePointToX(marker.frameIndex, STRIP_WIDTH, frameCount)}
            x2={framePointToX(marker.frameIndex, STRIP_WIDTH, frameCount)}
            y1={0}
            y2={STRIP_HEIGHT}
            stroke="rgba(226, 232, 240, 0.38)"
            strokeDasharray="2 4"
            strokeWidth={1}
          />
        ))}
        {visualFrameIndex !== pendingFrameIndex ? (
          <line
            x1={framePointToX(visualFrameIndex, STRIP_WIDTH, frameCount)}
            x2={framePointToX(visualFrameIndex, STRIP_WIDTH, frameCount)}
            y1={0}
            y2={STRIP_HEIGHT}
            stroke="rgba(226, 232, 240, 0.6)"
            strokeWidth={1.5}
          />
        ) : null}
        <line
          x1={framePointToX(pendingFrameIndex, STRIP_WIDTH, frameCount)}
          x2={framePointToX(pendingFrameIndex, STRIP_WIDTH, frameCount)}
          y1={0}
          y2={STRIP_HEIGHT}
          stroke="#ffffff"
          strokeWidth={2}
        />
      </svg>
    </div>
  );
}

type MetricLaneRowProps = {
  lane: MetricLane;
  passMarkers: readonly PassMarker[];
  frameCount: number;
  pendingFrameIndex: number;
  visualFrameIndex: number;
  onFrameInput: (frameIndex: number) => void;
};

function MetricLaneRow({
  lane,
  passMarkers,
  frameCount,
  pendingFrameIndex,
  visualFrameIndex,
  onFrameInput,
}: MetricLaneRowProps) {
  return (
    <div className="lane-row">
      <div className="lane-row-header">
        <div className="lane-row-title-group">
          <span className="lane-row-title">{lane.title}</span>
          <span className="lane-row-scale">{lane.scaleLabel}</span>
        </div>
        <div className="lane-row-values">
          {lane.series.map((series) => (
            <span key={series.label} className="lane-value">
              <span
                className="lane-swatch"
                style={{ backgroundColor: series.color }}
              />
              {series.label} {series.formatValue(series.currentValue)}
            </span>
          ))}
        </div>
      </div>

      <svg
        className="lane-svg"
        viewBox={`0 0 ${LANE_WIDTH} ${LANE_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={lane.title}
        onPointerDown={(event) =>
          onFrameInput(getFrameIndexFromPointer(event, frameCount))
        }
        onPointerMove={(event) => {
          if ((event.buttons & 1) === 1) {
            onFrameInput(getFrameIndexFromPointer(event, frameCount));
          }
        }}
      >
        <rect
          x={0}
          y={0}
          width={LANE_WIDTH}
          height={LANE_HEIGHT}
          rx={8}
          fill="rgba(7, 10, 18, 0.88)"
        />
        {GRID_LINES.map((value) => (
          <line
            key={value}
            x1={0}
            x2={LANE_WIDTH}
            y1={value * LANE_HEIGHT}
            y2={value * LANE_HEIGHT}
            stroke="rgba(148, 163, 184, 0.14)"
            strokeWidth={1}
          />
        ))}
        {passMarkers.map((marker) => (
          <line
            key={marker.key}
            x1={framePointToX(marker.frameIndex, LANE_WIDTH, frameCount)}
            x2={framePointToX(marker.frameIndex, LANE_WIDTH, frameCount)}
            y1={0}
            y2={LANE_HEIGHT}
            stroke="rgba(226, 232, 240, 0.28)"
            strokeDasharray="3 5"
            strokeWidth={1}
          />
        ))}
        {lane.series.map((series) => (
          <path
            key={series.label}
            d={buildLinePath(
              series.values,
              lane.normalizeValue,
              LANE_WIDTH,
              LANE_HEIGHT,
              frameCount,
            )}
            fill="none"
            stroke={series.color}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {visualFrameIndex !== pendingFrameIndex ? (
          <line
            x1={framePointToX(visualFrameIndex, LANE_WIDTH, frameCount)}
            x2={framePointToX(visualFrameIndex, LANE_WIDTH, frameCount)}
            y1={0}
            y2={LANE_HEIGHT}
            stroke="rgba(226, 232, 240, 0.42)"
            strokeWidth={1.5}
          />
        ) : null}
        <line
          x1={framePointToX(pendingFrameIndex, LANE_WIDTH, frameCount)}
          x2={framePointToX(pendingFrameIndex, LANE_WIDTH, frameCount)}
          y1={0}
          y2={LANE_HEIGHT}
          stroke="#ffffff"
          strokeWidth={2}
        />
        {lane.series.map((series) => (
          <circle
            key={`${series.label}-point`}
            cx={framePointToX(pendingFrameIndex, LANE_WIDTH, frameCount)}
            cy={valueToY(series.currentValue, lane.normalizeValue, LANE_HEIGHT)}
            r={3.5}
            fill={series.color}
            stroke="rgba(2, 6, 23, 0.9)"
            strokeWidth={1.5}
          />
        ))}
      </svg>
    </div>
  );
}

function StatusChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="insights-chip"
      style={{
        borderColor: `${color}55`,
        background: `linear-gradient(180deg, ${color}14 0%, rgba(9, 14, 24, 0.88) 100%)`,
      }}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildMetricLanes(
  frames: readonly SimulationFrame[],
  selectedFrameIndex: number,
): MetricLane[] {
  const linkEnabledValues = frames.map((frame) => frame.hardware.steering.linkEnabled);
  const slantRangeValues = frames.map((frame) => frame.groundStation.slantRangeM);
  const rangeRateValues = frames.map((frame) => frame.groundStation.rangeRateMps);
  const downlinkEirpValues = frames.map((frame) => frame.link.downlink.eirpDbw);
  const uplinkEirpValues = frames.map((frame) => frame.link.uplink.eirpDbw);
  const downlinkReceivePowerValues = frames.map(
    (frame) => frame.link.downlink.receivePowerDbw,
  );
  const uplinkReceivePowerValues = frames.map((frame) => frame.link.uplink.receivePowerDbw);
  const residualDownlinkValues = frames.map((frame) =>
    Math.abs(frame.hardware.oscillator.downlinkResidualHz),
  );
  const residualUplinkValues = frames.map((frame) =>
    Math.abs(frame.hardware.oscillator.uplinkResidualHz),
  );
  const scheduleDelayValues = frames.map(
    (frame) => frame.hardware.compute.scheduleDelaySeconds,
  );
  const downlinkSnrValues = frames.map((frame) => frame.link.downlink.effectiveSnrDb);
  const uplinkSnrValues = frames.map((frame) => frame.link.uplink.effectiveSnrDb);
  const downlinkPerValues = frames.map((frame) => frame.link.downlink.per);
  const uplinkPerValues = frames.map((frame) => frame.link.uplink.per);
  const downlinkServiceRateValues = frames.map(
    (frame) => frame.traffic.downlink.serviceRatePacketsPerSecond,
  );
  const uplinkServiceRateValues = frames.map(
    (frame) => frame.traffic.uplink.serviceRatePacketsPerSecond,
  );
  const downlinkQueueValues = frames.map((frame) => frame.traffic.downlink.queueBacklogPackets);
  const uplinkQueueValues = frames.map((frame) => frame.traffic.uplink.queueBacklogPackets);
  const downlinkGoodputValues = frames.map((frame) => frame.traffic.downlink.goodputBps);
  const uplinkGoodputValues = frames.map((frame) => frame.traffic.uplink.goodputBps);
  const downlinkLossValues = frames.map(
    (frame) => frame.traffic.downlink.packetLossFraction,
  );
  const uplinkLossValues = frames.map((frame) => frame.traffic.uplink.packetLossFraction);
  const downlinkLatencyValues = frames.map(
    (frame) => frame.traffic.downlink.meanLatencySeconds ?? 0,
  );
  const uplinkLatencyValues = frames.map(
    (frame) => frame.traffic.uplink.meanLatencySeconds ?? 0,
  );
  const downlinkJitterValues = frames.map(
    (frame) => frame.traffic.downlink.jitterSeconds ?? 0,
  );
  const uplinkJitterValues = frames.map((frame) => frame.traffic.uplink.jitterSeconds ?? 0);

  const slantRangeNormalizer = createLinearNormalizer(slantRangeValues);
  const rangeRateNormalizer = createLinearNormalizer(rangeRateValues);
  const eirpNormalizer = createConditionalLinearNormalizer(
    [...downlinkEirpValues, ...uplinkEirpValues],
    [...linkEnabledValues, ...linkEnabledValues],
  );
  const receivePowerNormalizer = createConditionalLinearNormalizer(
    [...downlinkReceivePowerValues, ...uplinkReceivePowerValues],
    [...linkEnabledValues, ...linkEnabledValues],
  );
  const residualNormalizer = createLinearNormalizer(
    [...residualDownlinkValues, ...residualUplinkValues],
    0,
    0.08,
  );
  const scheduleNormalizer = createLinearNormalizer(scheduleDelayValues, 0, 0.08);
  const snrNormalizer = createLinearNormalizer(
    [...downlinkSnrValues, ...uplinkSnrValues],
    undefined,
    0.08,
  );
  const serviceRateNormalizer = createLinearNormalizer(
    [...downlinkServiceRateValues, ...uplinkServiceRateValues],
    0,
  );
  const queueNormalizer = createLinearNormalizer(
    [...downlinkQueueValues, ...uplinkQueueValues],
    0,
  );
  const goodputNormalizer = createLinearNormalizer(
    [...downlinkGoodputValues, ...uplinkGoodputValues],
    0,
  );
  const latencyNormalizer = createLinearNormalizer(
    [...downlinkLatencyValues, ...uplinkLatencyValues],
    0,
  );
  const jitterNormalizer = createLinearNormalizer(
    [...downlinkJitterValues, ...uplinkJitterValues],
    0,
  );

  return [
    {
      id: "slant-range",
      title: "Slant range",
      scaleLabel: "km",
      normalizeValue: slantRangeNormalizer,
      series: [
        {
          label: "Range",
          color: "#67d2ff",
          values: slantRangeValues,
          currentValue: slantRangeValues[selectedFrameIndex],
          formatValue: (value) => formatDistanceMeters(value),
        },
      ],
    },
    {
      id: "range-rate",
      title: "Range rate",
      scaleLabel: "m/s",
      normalizeValue: rangeRateNormalizer,
      series: [
        {
          label: "Rate",
          color: "#38bdf8",
          values: rangeRateValues,
          currentValue: rangeRateValues[selectedFrameIndex],
          formatValue: (value) => formatSpeedMetersPerSecond(value),
        },
      ],
    },
    {
      id: "eirp",
      title: "EIRP",
      scaleLabel: "dBW",
      normalizeValue: eirpNormalizer,
      series: [
        {
          label: "DL",
          color: DIRECTION_COLORS.downlink,
          values: downlinkEirpValues,
          currentValue: downlinkEirpValues[selectedFrameIndex],
          formatValue: (value) => `${value.toFixed(2)} dBW`,
        },
        {
          label: "UL",
          color: DIRECTION_COLORS.uplink,
          values: uplinkEirpValues,
          currentValue: uplinkEirpValues[selectedFrameIndex],
          formatValue: (value) => `${value.toFixed(2)} dBW`,
        },
      ],
    },
    {
      id: "receive-power",
      title: "Receive power",
      scaleLabel: "dBW",
      normalizeValue: receivePowerNormalizer,
      series: [
        {
          label: "DL",
          color: DIRECTION_COLORS.downlink,
          values: downlinkReceivePowerValues,
          currentValue: downlinkReceivePowerValues[selectedFrameIndex],
          formatValue: (value) => `${value.toFixed(2)} dBW`,
        },
        {
          label: "UL",
          color: DIRECTION_COLORS.uplink,
          values: uplinkReceivePowerValues,
          currentValue: uplinkReceivePowerValues[selectedFrameIndex],
          formatValue: (value) => `${value.toFixed(2)} dBW`,
        },
      ],
    },
    {
      id: "residual-frequency",
      title: "Residual frequency",
      scaleLabel: "|Hz|",
      normalizeValue: residualNormalizer,
      series: [
        {
          label: "DL",
          color: DIRECTION_COLORS.downlink,
          values: residualDownlinkValues,
          currentValue: residualDownlinkValues[selectedFrameIndex],
          formatValue: (value) => formatFrequencyHz(value),
        },
        {
          label: "UL",
          color: DIRECTION_COLORS.uplink,
          values: residualUplinkValues,
          currentValue: residualUplinkValues[selectedFrameIndex],
          formatValue: (value) => formatFrequencyHz(value),
        },
      ],
    },
    {
      id: "schedule-delay",
      title: "Compute delay",
      scaleLabel: "seconds",
      normalizeValue: scheduleNormalizer,
      series: [
        {
          label: "Delay",
          color: "#a78bfa",
          values: scheduleDelayValues,
          currentValue: scheduleDelayValues[selectedFrameIndex],
          formatValue: (value) => formatSeconds(value),
        },
      ],
    },
    {
      id: "effective-snr",
      title: "Effective SNR",
      scaleLabel: "dB",
      normalizeValue: snrNormalizer,
      series: [
        {
          label: "DL",
          color: DIRECTION_COLORS.downlink,
          values: downlinkSnrValues,
          currentValue: downlinkSnrValues[selectedFrameIndex],
          formatValue: (value) => formatDb(value),
        },
        {
          label: "UL",
          color: DIRECTION_COLORS.uplink,
          values: uplinkSnrValues,
          currentValue: uplinkSnrValues[selectedFrameIndex],
          formatValue: (value) => formatDb(value),
        },
      ],
    },
    {
      id: "packet-error-rate",
      title: "Packet error rate",
      scaleLabel: "log ramp",
      normalizeValue: (value) =>
        clamp((Math.log10(Math.max(value, 1e-6)) + 6) / 6, 0, 1),
      series: [
        {
          label: "DL",
          color: DIRECTION_COLORS.downlink,
          values: downlinkPerValues,
          currentValue: downlinkPerValues[selectedFrameIndex],
          formatValue: (value) => formatProbability(value),
        },
        {
          label: "UL",
          color: DIRECTION_COLORS.uplink,
          values: uplinkPerValues,
          currentValue: uplinkPerValues[selectedFrameIndex],
          formatValue: (value) => formatProbability(value),
        },
      ],
    },
    {
      id: "service-rate",
      title: "Service rate",
      scaleLabel: "pps",
      normalizeValue: serviceRateNormalizer,
      series: [
        {
          label: "DL",
          color: DIRECTION_COLORS.downlink,
          values: downlinkServiceRateValues,
          currentValue: downlinkServiceRateValues[selectedFrameIndex],
          formatValue: (value) => formatPacketRate(value),
        },
        {
          label: "UL",
          color: DIRECTION_COLORS.uplink,
          values: uplinkServiceRateValues,
          currentValue: uplinkServiceRateValues[selectedFrameIndex],
          formatValue: (value) => formatPacketRate(value),
        },
      ],
    },
    {
      id: "queue-backlog",
      title: "Queue backlog",
      scaleLabel: "packets",
      normalizeValue: queueNormalizer,
      series: [
        {
          label: "DL",
          color: DIRECTION_COLORS.downlink,
          values: downlinkQueueValues,
          currentValue: downlinkQueueValues[selectedFrameIndex],
          formatValue: (value) => formatPacketCount(value),
        },
        {
          label: "UL",
          color: DIRECTION_COLORS.uplink,
          values: uplinkQueueValues,
          currentValue: uplinkQueueValues[selectedFrameIndex],
          formatValue: (value) => formatPacketCount(value),
        },
      ],
    },
    {
      id: "goodput",
      title: "Goodput",
      scaleLabel: "bps",
      normalizeValue: goodputNormalizer,
      series: [
        {
          label: "DL",
          color: DIRECTION_COLORS.downlink,
          values: downlinkGoodputValues,
          currentValue: downlinkGoodputValues[selectedFrameIndex],
          formatValue: (value) => formatBitRate(value),
        },
        {
          label: "UL",
          color: DIRECTION_COLORS.uplink,
          values: uplinkGoodputValues,
          currentValue: uplinkGoodputValues[selectedFrameIndex],
          formatValue: (value) => formatBitRate(value),
        },
      ],
    },
    {
      id: "packet-loss",
      title: "Packet loss",
      scaleLabel: "fraction",
      normalizeValue: (value) => clamp(value, 0, 1),
      series: [
        {
          label: "DL",
          color: DIRECTION_COLORS.downlink,
          values: downlinkLossValues,
          currentValue: downlinkLossValues[selectedFrameIndex],
          formatValue: (value) => formatPercent(value),
        },
        {
          label: "UL",
          color: DIRECTION_COLORS.uplink,
          values: uplinkLossValues,
          currentValue: uplinkLossValues[selectedFrameIndex],
          formatValue: (value) => formatPercent(value),
        },
      ],
    },
    {
      id: "latency",
      title: "Mean latency",
      scaleLabel: "seconds",
      normalizeValue: latencyNormalizer,
      series: [
        {
          label: "DL",
          color: DIRECTION_COLORS.downlink,
          values: downlinkLatencyValues,
          currentValue: downlinkLatencyValues[selectedFrameIndex],
          formatValue: (value) => formatSeconds(value),
        },
        {
          label: "UL",
          color: DIRECTION_COLORS.uplink,
          values: uplinkLatencyValues,
          currentValue: uplinkLatencyValues[selectedFrameIndex],
          formatValue: (value) => formatSeconds(value),
        },
      ],
    },
    {
      id: "jitter",
      title: "Jitter",
      scaleLabel: "seconds",
      normalizeValue: jitterNormalizer,
      series: [
        {
          label: "DL",
          color: DIRECTION_COLORS.downlink,
          values: downlinkJitterValues,
          currentValue: downlinkJitterValues[selectedFrameIndex],
          formatValue: (value) => formatSeconds(value),
        },
        {
          label: "UL",
          color: DIRECTION_COLORS.uplink,
          values: uplinkJitterValues,
          currentValue: uplinkJitterValues[selectedFrameIndex],
          formatValue: (value) => formatSeconds(value),
        },
      ],
    },
  ];
}

function buildStripRows(frames: readonly SimulationFrame[]) {
  const linkEnabledValues = frames.map((frame) => frame.hardware.steering.linkEnabled);
  const downlinkMcsValues = frames.map((frame) => getMcsIndex(frame.link.downlink.selectedMcs.id));
  const uplinkMcsValues = frames.map((frame) => getMcsIndex(frame.link.uplink.selectedMcs.id));

  return [
    {
      id: "link-enabled",
      label: "Link enabled",
      segments: buildCategorySegments(linkEnabledValues, (value) =>
        value ? "#34d399" : "#ef4444",
      ),
      getSelectedValue: (frame: SimulationFrame) =>
        frame.hardware.steering.linkEnabled ? "Enabled" : "Disabled",
    },
    {
      id: "downlink-mcs",
      label: "Downlink MCS",
      segments: buildCategorySegments(downlinkMcsValues, getMcsColor),
      getSelectedValue: (frame: SimulationFrame) =>
        frame.link.downlink.selectedMcs.label ?? "Outage",
    },
    {
      id: "uplink-mcs",
      label: "Uplink MCS",
      segments: buildCategorySegments(uplinkMcsValues, getMcsColor),
      getSelectedValue: (frame: SimulationFrame) =>
        frame.link.uplink.selectedMcs.label ?? "Outage",
    },
  ];
}

function buildPassMarkers(frames: readonly SimulationFrame[]): PassMarker[] {
  if (frames.length === 0) {
    return [];
  }

  const { kIn, kApex, kOut } = frames[0].groundStation;
  const markers = [
    { key: "k-in", label: "Ingress", frameIndex: kIn },
    { key: "k-apex", label: "Apex", frameIndex: kApex },
    { key: "k-out", label: "Egress", frameIndex: kOut },
  ];

  return markers.filter(
    (marker): marker is PassMarker => marker.frameIndex !== null,
  );
}

function buildCategorySegments<T>(
  values: readonly T[],
  getColor: (value: T) => string,
): StripSegment[] {
  if (values.length === 0) {
    return [];
  }

  const segments: StripSegment[] = [];
  let currentValue = values[0];
  let startFrameIndex = 0;

  for (let index = 1; index < values.length; index += 1) {
    if (values[index] !== currentValue) {
      segments.push({
        startFrameIndex,
        endFrameIndex: index - 1,
        color: getColor(currentValue),
      });
      startFrameIndex = index;
      currentValue = values[index];
    }
  }

  segments.push({
    startFrameIndex,
    endFrameIndex: values.length - 1,
    color: getColor(currentValue),
  });

  return segments;
}

function getImpactLabel(frame: SimulationFrame) {
  const maxLoss = Math.max(
    frame.traffic.downlink.packetLossFraction,
    frame.traffic.uplink.packetLossFraction,
  );
  const totalGoodput =
    frame.traffic.downlink.goodputBps + frame.traffic.uplink.goodputBps;
  const totalBacklog =
    frame.traffic.downlink.queueBacklogPackets + frame.traffic.uplink.queueBacklogPackets;

  if (!frame.hardware.steering.linkEnabled) {
    return "Outage";
  }

  if (maxLoss >= 0.1) {
    return "Packet loss spike";
  }

  if (totalBacklog > 0 || totalGoodput === 0) {
    return "Queue growth";
  }

  if (
    frame.link.downlink.selectedMcs.id === null ||
    frame.link.uplink.selectedMcs.id === null
  ) {
    return "Link degraded";
  }

  return "Nominal";
}

function getImpactColor(label: string) {
  switch (label) {
    case "Outage":
      return "#ef4444";
    case "Packet loss spike":
      return "#fb7185";
    case "Queue growth":
      return "#f59e0b";
    case "Link degraded":
      return "#fde047";
    default:
      return "#34d399";
  }
}

function getMcsIndex(mcsId: string | null) {
  if (!mcsId) {
    return -1;
  }

  const match = mcsId.match(/MCS-(\d+)/);

  return match ? Number(match[1]) : -1;
}

function normalizeMcsIndex(index: number) {
  if (index < 0) {
    return 0;
  }

  return clamp(index / 7, 0, 1);
}

function getMcsColor(index: number) {
  if (index < 0) {
    return "#ef4444";
  }

  const hue = 12 + normalizeMcsIndex(index) * 136;

  return `hsl(${hue} 76% 54%)`;
}

function createLinearNormalizer(
  values: readonly number[],
  minOverride?: number,
  paddingFraction = 0.06,
) {
  const minimumValue = minOverride ?? Math.min(...values);
  const maximumValue = Math.max(...values);
  const span = Math.max(maximumValue - minimumValue, 1e-6);
  const paddedMinimum = minOverride ?? minimumValue - span * paddingFraction;
  const paddedMaximum = maximumValue + span * paddingFraction;
  const paddedSpan = Math.max(paddedMaximum - paddedMinimum, 1e-6);

  return (value: number) => clamp((value - paddedMinimum) / paddedSpan, 0, 1);
}

function createConditionalLinearNormalizer(
  values: readonly number[],
  includeMask: readonly boolean[],
  minOverride?: number,
  paddingFraction = 0.06,
) {
  const filteredValues = values.filter((_, index) => includeMask[index]);

  return createLinearNormalizer(
    filteredValues.length > 1 ? filteredValues : values,
    minOverride,
    paddingFraction,
  );
}

function buildLinePath(
  values: readonly number[],
  normalizeValue: (value: number) => number,
  width: number,
  height: number,
  frameCount: number,
) {
  if (values.length === 0) {
    return "";
  }

  return values
    .map((value, index) => {
      const x = framePointToX(index, width, frameCount);
      const y = valueToY(value, normalizeValue, height);

      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function valueToY(
  value: number,
  normalizeValue: (value: number) => number,
  height: number,
) {
  return (1 - normalizeValue(value)) * height;
}

function framePointToX(frameIndex: number, width: number, frameCount: number) {
  return (frameIndex / Math.max(frameCount - 1, 1)) * Math.max(width - 1, 1);
}

function frameBucketToX(frameIndex: number, width: number, frameCount: number) {
  return (frameIndex / Math.max(frameCount, 1)) * width;
}

function getFrameIndexFromPointer(
  event: PointerEvent<SVGSVGElement>,
  frameCount: number,
) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const positionFraction = clamp(
    (event.clientX - bounds.left) / bounds.width,
    0,
    1,
  );

  return Math.round(positionFraction * Math.max(frameCount - 1, 0));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
