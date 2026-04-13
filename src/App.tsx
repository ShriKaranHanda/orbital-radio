import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  DEFAULT_SIMULATION_STATE,
  type GroundStationConfig,
} from "../state";
import { GlobeScene } from "./components/GlobeScene";
import { GroundStationCard } from "./components/GroundStationCard";
import { GroundStationHover } from "./components/GroundStationHover";
import { SimulationTimeline } from "./components/SimulationTimeline";
import type { GroundStation } from "./types";

declare global {
  interface Window {
    __simulationDebug?: {
      beginScrub: () => void;
      endScrub: () => void;
      getPendingFrameIndex: () => number;
      getVisualFrameIndex: () => number;
      getCurrentUnixMs: () => number;
    };
  }
}

const TIMELINE_THROTTLE_MS = 100;

export function App() {
  const simulationState = DEFAULT_SIMULATION_STATE;
  const groundStation = useMemo(
    () => toGroundStation(simulationState.config.groundStation),
    [simulationState.config.groundStation],
  );

  const [selectedStation, setSelectedStation] = useState<GroundStation | null>(null);
  const [hover, setHover] = useState<{
    station: GroundStation;
    x: number;
    y: number;
  } | null>(null);
  const [pendingFrameIndex, setPendingFrameIndex] = useState(0);
  const [visualFrameIndex, setVisualFrameIndex] = useState(0);
  const pendingFrameIndexRef = useRef(0);

  const isScrubbingRef = useRef(false);
  const throttleRef = useRef<{
    hasCommittedDuringScrub: boolean;
    lastCommittedAt: number;
    queuedFrameIndex: number | null;
    timeoutId: number | null;
  }>({
    hasCommittedDuringScrub: false,
    lastCommittedAt: 0,
    queuedFrameIndex: null,
    timeoutId: null,
  });

  const visualFrame = simulationState.frames[visualFrameIndex];
  pendingFrameIndexRef.current = pendingFrameIndex;

  const beginScrub = () => {
    isScrubbingRef.current = true;
    throttleRef.current.hasCommittedDuringScrub = false;
    throttleRef.current.lastCommittedAt = performance.now();
  };

  const endScrub = () => {
    if (!isScrubbingRef.current) return;

    isScrubbingRef.current = false;
    commitVisualFrame(pendingFrameIndexRef.current, setVisualFrameIndex, throttleRef);
  };

  useEffect(() => {
    window.addEventListener("pointerup", endScrub);
    window.addEventListener("pointercancel", endScrub);

    return () => {
      window.removeEventListener("pointerup", endScrub);
      window.removeEventListener("pointercancel", endScrub);
    };
  });

  useEffect(() => {
    window.__simulationDebug = {
      beginScrub,
      endScrub,
      getPendingFrameIndex: () => pendingFrameIndex,
      getVisualFrameIndex: () => visualFrameIndex,
      getCurrentUnixMs: () => visualFrame.currentUnixMs,
    };

    return () => {
      delete window.__simulationDebug;
    };
  }, [pendingFrameIndex, visualFrame, visualFrameIndex]);

  useEffect(
    () => () => {
      const timeoutId = throttleRef.current.timeoutId;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    },
    [],
  );

  const handleFrameInput = (frameIndex: number) => {
    setPendingFrameIndex(frameIndex);

    if (!isScrubbingRef.current) {
      commitVisualFrame(frameIndex, setVisualFrameIndex, throttleRef);
      return;
    }

    scheduleVisualFrame(frameIndex, setVisualFrameIndex, throttleRef);
  };

  return (
    <main className="app-shell">
      <GlobeScene
        clock={simulationState.clock}
        groundStation={groundStation}
        frame={visualFrame}
        selectedStation={selectedStation}
        onGroundStationHover={setHover}
        onGroundStationSelect={setSelectedStation}
      />

      {hover ? <GroundStationHover hover={hover} /> : null}

      {selectedStation ? (
        <GroundStationCard
          station={selectedStation}
          onClose={() => setSelectedStation(null)}
        />
      ) : null}

      <SimulationTimeline
        clock={simulationState.clock}
        frames={simulationState.frames}
        pendingFrameIndex={pendingFrameIndex}
        visualFrameIndex={visualFrameIndex}
        onFrameInput={handleFrameInput}
        onScrubStart={beginScrub}
      />
    </main>
  );
}

function toGroundStation(config: GroundStationConfig): GroundStation {
  return {
    id: "ground-station",
    ...config,
  };
}

function scheduleVisualFrame(
  frameIndex: number,
  setVisualFrameIndex: (frameIndex: number) => void,
  throttleRef: MutableRefObject<{
    hasCommittedDuringScrub: boolean;
    lastCommittedAt: number;
    queuedFrameIndex: number | null;
    timeoutId: number | null;
  }>,
) {
  if (!throttleRef.current.hasCommittedDuringScrub) {
    throttleRef.current.queuedFrameIndex = frameIndex;

    if (throttleRef.current.timeoutId !== null) {
      return;
    }

    throttleRef.current.timeoutId = window.setTimeout(() => {
      const queuedFrameIndex = throttleRef.current.queuedFrameIndex;
      if (queuedFrameIndex !== null) {
        commitVisualFrame(queuedFrameIndex, setVisualFrameIndex, throttleRef);
      }
    }, TIMELINE_THROTTLE_MS);
    return;
  }

  const now = performance.now();
  const elapsedSinceCommit = now - throttleRef.current.lastCommittedAt;

  if (elapsedSinceCommit >= TIMELINE_THROTTLE_MS) {
    commitVisualFrame(frameIndex, setVisualFrameIndex, throttleRef);
    return;
  }

  throttleRef.current.queuedFrameIndex = frameIndex;

  if (throttleRef.current.timeoutId !== null) {
    return;
  }

  throttleRef.current.timeoutId = window.setTimeout(() => {
    const queuedFrameIndex = throttleRef.current.queuedFrameIndex;
    if (queuedFrameIndex !== null) {
      commitVisualFrame(queuedFrameIndex, setVisualFrameIndex, throttleRef);
    }
  }, TIMELINE_THROTTLE_MS - elapsedSinceCommit);
}

function commitVisualFrame(
  frameIndex: number,
  setVisualFrameIndex: (frameIndex: number) => void,
  throttleRef: MutableRefObject<{
    hasCommittedDuringScrub: boolean;
    lastCommittedAt: number;
    queuedFrameIndex: number | null;
    timeoutId: number | null;
  }>,
) {
  if (throttleRef.current.timeoutId !== null) {
    window.clearTimeout(throttleRef.current.timeoutId);
    throttleRef.current.timeoutId = null;
  }

  throttleRef.current.hasCommittedDuringScrub = true;
  throttleRef.current.lastCommittedAt = performance.now();
  throttleRef.current.queuedFrameIndex = null;
  setVisualFrameIndex(frameIndex);
}
