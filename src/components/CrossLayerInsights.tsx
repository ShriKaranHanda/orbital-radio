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
import type { HardwareReasonTag, SimulationFrame } from "../../state";
import {
  formatBitRate,
  formatDb,
  formatFrequencyHz,
  formatPercent,
  formatProbability,
  formatSeconds,
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
const REASON_COLORS: Record<string, string> = {
  nominal: "#34d399",
  array_scan_loss: "#38bdf8",
  field_of_regard: "#f59e0b",
  freq_error: "#fb7185",
  pa_backoff: "#f97316",
  thermal_throttle: "#ef4444",
  compute_overload: "#a78bfa",
  power_limited: "#fde047",
};

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
  const mcsRows = useMemo(() => buildMcsRows(frames), [frames]);
  const visibleReasons = useMemo(() => getVisibleReasons(frames), [frames]);

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
  const selectedTotalServiceBps =
    selectedFrame.link.downlink.scheduledPayloadRateBps +
    selectedFrame.link.uplink.scheduledPayloadRateBps;

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
            label="Cause"
            value={formatReasonLabel(selectedFrame.hardware.reason.dominantTag)}
            color={getReasonColor(selectedFrame.hardware.reason.dominantTag)}
          />
          <StatusChip
            label="Impact"
            value={selectedImpact}
            color={getImpactColor(selectedImpact)}
          />
          <StatusChip
            label="DL MCS"
            value={selectedFrame.link.downlink.selectedMcs.label ?? "Outage"}
            color={getMcsColor(getMcsIndex(selectedFrame.link.downlink.selectedMcs.id))}
          />
          <StatusChip
            label="UL MCS"
            value={selectedFrame.link.uplink.selectedMcs.label ?? "Outage"}
            color={getMcsColor(getMcsIndex(selectedFrame.link.uplink.selectedMcs.id))}
          />
          <StatusChip
            label="Service"
            value={formatBitRate(selectedTotalServiceBps)}
            color="#5de0a4"
          />
        </div>
      </header>

      <div className="insights-section">
        <div className="insights-section-header">
          <span>Reason to impact</span>
          <small>
            Cause, coding pressure, packet loss, and service collapse on a shared
            time axis.
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

        <div className="insights-legend" aria-label="Reason legend">
          {visibleReasons.map((reason) => (
            <span key={reason} className="insights-legend-item">
              <span
                className="insights-legend-swatch"
                style={{
                  backgroundColor: getReasonColor(
                    reason === "nominal" ? null : reason,
                  ),
                }}
              />
              {formatReasonLabel(reason === "nominal" ? null : reason)}
            </span>
          ))}
        </div>
      </div>

      <div className="insights-section">
        <div className="insights-section-header">
          <span>Metric lanes</span>
          <small>
            Array, RF, timing, compute, power, SNR, PER, and coding stay aligned
            to the same second.
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

      <div className="insights-section">
        <div className="insights-section-header">
          <span>MCS tracks</span>
          <small>Discrete coding shifts for downlink and uplink.</small>
        </div>

        <div className="strip-stack">
          {mcsRows.map((row) => (
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
  const arrayGainValues = frames.map((frame) => frame.hardware.phasedArray.arrayGainDbi);
  const paCompressionValues = frames.map(
    (frame) => frame.hardware.powerAmplifier.compressionLossDb,
  );
  const residualDownlinkValues = frames.map((frame) =>
    Math.abs(frame.hardware.oscillator.downlinkResidualHz),
  );
  const residualUplinkValues = frames.map((frame) =>
    Math.abs(frame.hardware.oscillator.uplinkResidualHz),
  );
  const scheduleDelayValues = frames.map(
    (frame) => frame.hardware.compute.scheduleDelaySeconds,
  );
  const powerSheddingValues = frames.map((frame) => frame.hardware.powerBus.sheddingFactor);
  const downlinkSnrValues = frames.map((frame) => frame.link.downlink.effectiveSnrDb);
  const uplinkSnrValues = frames.map((frame) => frame.link.uplink.effectiveSnrDb);
  const downlinkPerValues = frames.map((frame) => frame.link.downlink.per);
  const uplinkPerValues = frames.map((frame) => frame.link.uplink.per);

  const arrayGainNormalizer = createLinearNormalizer(arrayGainValues);
  const paCompressionNormalizer = createLinearNormalizer(paCompressionValues, 0, 0.08);
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

  return [
    {
      id: "array-gain",
      title: "Array gain",
      scaleLabel: "dBi",
      normalizeValue: arrayGainNormalizer,
      series: [
        {
          label: "Array",
          color: "#67d2ff",
          values: arrayGainValues,
          currentValue: arrayGainValues[selectedFrameIndex],
          formatValue: (value) => formatDb(value),
        },
      ],
    },
    {
      id: "pa-compression",
      title: "PA compression",
      scaleLabel: "dB loss",
      normalizeValue: paCompressionNormalizer,
      series: [
        {
          label: "Compression",
          color: "#f59e0b",
          values: paCompressionValues,
          currentValue: paCompressionValues[selectedFrameIndex],
          formatValue: (value) => formatDb(value),
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
      id: "power-shedding",
      title: "Power shedding",
      scaleLabel: "fraction",
      normalizeValue: (value) => clamp(value, 0, 1),
      series: [
        {
          label: "Shedding",
          color: "#fde047",
          values: powerSheddingValues,
          currentValue: powerSheddingValues[selectedFrameIndex],
          formatValue: (value) => formatPercent(value),
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
  ];
}

function buildStripRows(frames: readonly SimulationFrame[]) {
  const maxTotalService =
    Math.max(
      ...frames.map(
        (frame) =>
          frame.link.downlink.scheduledPayloadRateBps +
          frame.link.uplink.scheduledPayloadRateBps,
      ),
      1,
    ) || 1;

  const causeValues = frames.map(
    (frame) => frame.hardware.reason.dominantTag ?? "nominal",
  );
  const mcsDropValues = frames.map((frame) => {
    const downlinkIndex = normalizeMcsIndex(
      getMcsIndex(frame.link.downlink.selectedMcs.id),
    );
    const uplinkIndex = normalizeMcsIndex(
      getMcsIndex(frame.link.uplink.selectedMcs.id),
    );

    return 1 - (downlinkIndex + uplinkIndex) / 2;
  });
  const perSeverityValues = frames.map((frame) =>
    Math.pow(Math.max(frame.link.downlink.per, frame.link.uplink.per), 0.25),
  );
  const serviceDropValues = frames.map((frame) => {
    const totalService =
      frame.link.downlink.scheduledPayloadRateBps +
      frame.link.uplink.scheduledPayloadRateBps;

    return 1 - clamp(totalService / maxTotalService, 0, 1);
  });

  return [
    {
      id: "cause",
      label: "Cause",
      segments: buildCategorySegments(causeValues, (value) =>
        getReasonColor(value === "nominal" ? null : (value as HardwareReasonTag)),
      ),
      getSelectedValue: (frame: SimulationFrame) =>
        formatReasonLabel(frame.hardware.reason.dominantTag),
    },
    {
      id: "mcs-drop",
      label: "MCS pressure",
      segments: buildSeveritySegments(mcsDropValues),
      getSelectedValue: (frame: SimulationFrame) => {
        const downlinkLabel = frame.link.downlink.selectedMcs.label ?? "Outage";
        const uplinkLabel = frame.link.uplink.selectedMcs.label ?? "Outage";

        return `DL ${downlinkLabel} / UL ${uplinkLabel}`;
      },
    },
    {
      id: "per-spike",
      label: "PER spike",
      segments: buildSeveritySegments(perSeverityValues),
      getSelectedValue: (frame: SimulationFrame) =>
        `Max ${formatProbability(
          Math.max(frame.link.downlink.per, frame.link.uplink.per),
        )}`,
    },
    {
      id: "service-drop",
      label: "Service drop",
      segments: buildSeveritySegments(serviceDropValues),
      getSelectedValue: (frame: SimulationFrame) =>
        formatBitRate(
          frame.link.downlink.scheduledPayloadRateBps +
            frame.link.uplink.scheduledPayloadRateBps,
        ),
    },
  ];
}

function buildMcsRows(frames: readonly SimulationFrame[]) {
  const downlinkValues = frames.map((frame) =>
    getMcsIndex(frame.link.downlink.selectedMcs.id),
  );
  const uplinkValues = frames.map((frame) =>
    getMcsIndex(frame.link.uplink.selectedMcs.id),
  );

  return [
    {
      id: "downlink-mcs",
      label: "Downlink MCS",
      segments: buildCategorySegments(downlinkValues, getMcsColor),
      getSelectedValue: (frame: SimulationFrame) =>
        frame.link.downlink.selectedMcs.label ?? "Outage",
    },
    {
      id: "uplink-mcs",
      label: "Uplink MCS",
      segments: buildCategorySegments(uplinkValues, getMcsColor),
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

function buildSeveritySegments(values: readonly number[]): StripSegment[] {
  const quantizedValues = values.map(
    (value) => Math.round(clamp(value, 0, 1) * 24) / 24,
  );

  return buildCategorySegments(quantizedValues, getSeverityColor);
}

function getVisibleReasons(frames: readonly SimulationFrame[]) {
  const reasons = new Set<string>(["nominal"]);

  for (const frame of frames) {
    reasons.add(frame.hardware.reason.dominantTag ?? "nominal");
  }

  return [...reasons];
}

function getImpactLabel(frame: SimulationFrame) {
  const maxPer = Math.max(frame.link.downlink.per, frame.link.uplink.per);
  const downlinkMcs = getMcsIndex(frame.link.downlink.selectedMcs.id);
  const uplinkMcs = getMcsIndex(frame.link.uplink.selectedMcs.id);
  const totalService =
    frame.link.downlink.scheduledPayloadRateBps +
    frame.link.uplink.scheduledPayloadRateBps;

  if (downlinkMcs === -1 && uplinkMcs === -1) {
    return "Outage";
  }

  if (maxPer >= 0.1) {
    return "Packet loss spike";
  }

  if (frame.hardware.powerBus.sheddingFactor >= 0.2 || totalService === 0) {
    return "Capacity drop";
  }

  if (downlinkMcs <= 1 || uplinkMcs <= 1) {
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
    case "Capacity drop":
      return "#f59e0b";
    case "Link degraded":
      return "#fde047";
    default:
      return "#34d399";
  }
}

function getReasonColor(reason: HardwareReasonTag | string | null) {
  return REASON_COLORS[reason ?? "nominal"] ?? "#94a3b8";
}

function getSeverityColor(value: number) {
  const clamped = clamp(value, 0, 1);
  const hue = 150 - clamped * 150;
  const lightness = 42 + (1 - clamped) * 10;

  return `hsl(${hue} 82% ${lightness}%)`;
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

function formatReasonLabel(reason: HardwareReasonTag | string | null) {
  return reason ? reason.replaceAll("_", " ") : "nominal";
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
