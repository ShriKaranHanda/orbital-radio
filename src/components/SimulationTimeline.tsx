import type { SimulationClock, SimulationFrame } from "../../state";
import { getElapsedSeconds } from "../lib/simulation-visuals";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

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

      <div className="timeline-endpoints" aria-hidden="true">
        <span>{formatTimestamp(clock.startUnixMs)}</span>
        <span>{formatTimestamp(clock.endUnixMs)}</span>
      </div>
    </section>
  );
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
