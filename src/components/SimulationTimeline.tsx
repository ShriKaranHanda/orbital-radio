import { useMemo } from "react";
import type { SimulationClock, SimulationFrame } from "../../state";
import { getElapsedSeconds } from "../lib/simulation-visuals";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

type SimulationTimelineProps = {
  clock: SimulationClock;
  frames: readonly SimulationFrame[];
  pendingFrameIndex: number;
  visualFrameIndex: number;
  isPlaying: boolean;
  onFrameInput: (frameIndex: number) => void;
  onScrubStart: () => void;
  onNextFrame: () => void;
  onPreviousFrame: () => void;
  onPlayToggle: () => void;
};

export function SimulationTimeline({
  clock,
  frames,
  pendingFrameIndex,
  visualFrameIndex,
  isPlaying,
  onFrameInput,
  onScrubStart,
  onNextFrame,
  onPreviousFrame,
  onPlayToggle,
}: SimulationTimelineProps) {
  const pendingFrame = frames[pendingFrameIndex];
  const visualFrame = frames[visualFrameIndex];
  const faultWindows = useMemo(() => buildFaultWindows(frames), [frames]);
  const passMarkers = useMemo(() => buildPassMarkers(frames), [frames]);

  return (
    <section className="timeline-panel" aria-label="Simulation timeline panel">
      <div className="timeline-summary">
        <div className="timeline-summary-block">
          <span className="timeline-label">Selected</span>
          <strong>{formatTimestamp(pendingFrame.currentUnixMs)}</strong>
        </div>
        <div className="timeline-controls" role="group" aria-label="Timeline playback controls">
          <button
            className="timeline-control-button"
            type="button"
            onClick={onPreviousFrame}
            disabled={pendingFrameIndex === 0}
            aria-label="Previous frame"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="timeline-control-button"
            type="button"
            onClick={onPlayToggle}
            aria-label={isPlaying ? "Pause timeline" : "Play timeline"}
            aria-pressed={isPlaying}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            className="timeline-control-button"
            type="button"
            onClick={onNextFrame}
            disabled={pendingFrameIndex === frames.length - 1}
            aria-label="Next frame"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="timeline-summary-block timeline-summary-block-right">
          <span className="timeline-label">Rendered</span>
          <strong>
            T+{Math.round(getElapsedSeconds(clock, visualFrame.currentUnixMs))}
            s
          </strong>
        </div>
      </div>

      <div className="timeline-track-shell">
        <TooltipProvider>
          <div className="timeline-pass-markers" aria-label="Pass timeline markers">
            {passMarkers.map((marker) => (
              <Tooltip key={marker.key}>
                <TooltipTrigger asChild>
                  <button
                    className="timeline-pass-marker"
                    type="button"
                    style={{ left: `${marker.positionPercent}%` }}
                    aria-label={`${marker.label}, ${formatTimestamp(marker.unixMs)}`}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="center"
                  sideOffset={6}
                  className="timeline-pass-tooltip"
                >
                  <strong>{marker.label}</strong>
                  <span>{formatTimestamp(marker.unixMs)}</span>
                  <span>Frame {marker.frameIndex}</span>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          <div
            className="timeline-fault-track"
            aria-label="Fault timeline overlay"
          >
            {faultWindows.map((window) => (
              <Tooltip key={window.windowKey}>
                <TooltipTrigger asChild>
                  <button
                    className="timeline-fault-window"
                    type="button"
                    style={{
                      left: `${window.startPercent}%`,
                      width: `${window.widthPercent}%`,
                    }}
                    tabIndex={0}
                    aria-label={`${window.label}, ${formatTimestamp(
                      window.startUnixMs,
                    )} to ${formatTimestamp(window.endUnixMs)}`}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="start"
                  sideOffset={6}
                  className="timeline-fault-tooltip"
                >
                  <strong>{window.label}</strong>
                  <span>
                    {formatTimestamp(window.startUnixMs)} to{" "}
                    {formatTimestamp(window.endUnixMs)}
                  </span>
                  <span>
                    Frames {window.startFrameIndex} to {window.endFrameIndex}
                  </span>
                  <span>Kind {formatFaultKind(window.kind)}</span>
                  <span>Severity {(window.severity ?? 1).toFixed(2)}</span>
                  <span>{formatFaultEffects(window.effectEntries)}</span>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>

        <input
          className="timeline-slider"
          aria-label="Simulation timeline"
          type="range"
          min={0}
          max={frames.length - 1}
          step={1}
          value={pendingFrameIndex}
          onInput={(event) =>
            onFrameInput(Number((event.target as HTMLInputElement).value))
          }
          onChange={(event) =>
            onFrameInput(Number((event.target as HTMLInputElement).value))
          }
          onPointerDown={onScrubStart}
        />
      </div>

      <div className="timeline-endpoints" aria-hidden="true">
        <span>{formatTimestamp(clock.startUnixMs)}</span>
        <span>{formatTimestamp(clock.endUnixMs)}</span>
      </div>
    </section>
  );
}

type FaultWindow = {
  windowKey: string;
  id: string;
  label: string;
  kind: string;
  severity: number | undefined;
  startFrameIndex: number;
  endFrameIndex: number;
  startUnixMs: number;
  endUnixMs: number;
  startPercent: number;
  widthPercent: number;
  effectEntries: Array<[string, number]>;
};

type PassMarker = {
  key: string;
  label: string;
  frameIndex: number;
  unixMs: number;
  positionPercent: number;
};

function buildFaultWindows(frames: readonly SimulationFrame[]): FaultWindow[] {
  if (frames.length === 0) {
    return [];
  }

  const frameStepMs =
    frames.length > 1 ? frames[1].currentUnixMs - frames[0].currentUnixMs : 1_000;
  const windows: Array<Omit<FaultWindow, "startPercent" | "widthPercent">> = [];
  const activeWindows = new Map<
    string,
    Omit<FaultWindow, "startPercent" | "widthPercent">
  >();

  for (const frame of frames) {
    const activeIds = new Set(frame.hardware.activeFaults.map((fault) => fault.id));

    for (const [faultId, activeWindow] of activeWindows) {
      if (!activeIds.has(faultId)) {
        windows.push(activeWindow);
        activeWindows.delete(faultId);
      }
    }

    for (const fault of frame.hardware.activeFaults) {
      const existingWindow = activeWindows.get(fault.id);

      if (!existingWindow) {
        activeWindows.set(fault.id, {
          windowKey: `${fault.id}-${frame.index}`,
          id: fault.id,
          label: fault.label,
          kind: fault.kind,
          severity: fault.severity,
          startFrameIndex: frame.index,
          endFrameIndex: frame.index,
          startUnixMs: frame.currentUnixMs,
          endUnixMs: frame.currentUnixMs + frameStepMs,
          effectEntries: Object.entries(fault.effects).filter(
            ([, value]) => value !== 0,
          ) as Array<[string, number]>,
        });
        continue;
      }

      existingWindow.endFrameIndex = frame.index;
      existingWindow.endUnixMs = frame.currentUnixMs + frameStepMs;
    }
  }

  windows.push(...activeWindows.values());

  const totalFrameCount = Math.max(1, frames.length - 1);
  const sortedWindows = windows.sort(
    (left, right) => left.startFrameIndex - right.startFrameIndex,
  );

  return sortedWindows.map((window) => {
    const startPercent = (window.startFrameIndex / totalFrameCount) * 100;
    const widthPercent = Math.max(
      ((window.endFrameIndex - window.startFrameIndex + 1) / totalFrameCount) * 100,
      0.5,
    );

    return {
      ...window,
      startPercent,
      widthPercent,
    };
  });
}

function buildPassMarkers(frames: readonly SimulationFrame[]): PassMarker[] {
  if (frames.length === 0) {
    return [];
  }

  const totalFrameCount = Math.max(1, frames.length - 1);
  const { kIn, kApex, kOut } = frames[0].groundStation;
  const markerDefinitions = [
    { label: "Pass ingress", frameIndex: kIn },
    { label: "Pass apex", frameIndex: kApex },
    { label: "Pass egress", frameIndex: kOut },
  ];

  return markerDefinitions
    .filter((marker): marker is { label: string; frameIndex: number } => marker.frameIndex !== null)
    .map((marker) => ({
      key: `pass-marker-${marker.label}-${marker.frameIndex}`,
      label: marker.label,
      frameIndex: marker.frameIndex,
      unixMs: frames[marker.frameIndex].currentUnixMs,
      positionPercent: (marker.frameIndex / totalFrameCount) * 100,
    }));
}

function formatTimestamp(unixMs: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    hour12: false,
  }).format(unixMs);
}

function formatFaultKind(value: string) {
  return value.replaceAll("_", " ");
}

function formatFaultEffects(entries: Array<[string, number]>) {
  if (entries.length === 0) {
    return "No explicit effect overrides";
  }

  return entries
    .map(([key, value]) => `${formatFaultEffectKey(key)} ${formatFaultEffectValue(value)}`)
    .join(", ");
}

function formatFaultEffectKey(key: string) {
  return key.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ").toLowerCase();
}

function formatFaultEffectValue(value: number) {
  if (Math.abs(value) >= 1_000) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  if (Math.abs(value) >= 1) {
    return value.toFixed(2);
  }

  return value.toExponential(2);
}
