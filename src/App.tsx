import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { DEFAULT_SIMULATION_STATE, type GroundStationConfig, type TleElements } from "../state";
import { GlobeScene } from "./components/GlobeScene";
import { CrossLayerInsights } from "./components/CrossLayerInsights";
import { GroundStationCard } from "./components/GroundStationCard";
import { SatelliteCard } from "./components/SatelliteCard";
import { SimulationTimeline } from "./components/SimulationTimeline";
import type { GroundStation, Satellite } from "./types";

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

const TIMELINE_THROTTLE_MS = 10;
const TIMELINE_PLAYBACK_INTERVAL_MS = 20;

export function App() {
  const simulationState = DEFAULT_SIMULATION_STATE;
  const groundStation = useMemo(
    () => toGroundStation(simulationState.config.groundStation),
    [simulationState.config.groundStation],
  );
  const satellite = useMemo(
    () => toSatellite(simulationState.config.tle),
    [simulationState.config.tle],
  );

  const [selectedStation, setSelectedStation] = useState<GroundStation | null>(null);
  const [selectedSatellite, setSelectedSatellite] = useState<Satellite | null>(null);
  const [pendingFrameIndex, setPendingFrameIndex] = useState(0);
  const [visualFrameIndex, setVisualFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [areGraphsVisible, setAreGraphsVisible] = useState(true);
  const pendingFrameIndexRef = useRef(0);
  const playbackIntervalRef = useRef<number | null>(null);

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
  const lastFrameIndex = simulationState.frames.length - 1;

  const handleGroundStationSelect = useCallback((station: GroundStation) => {
    setSelectedSatellite(null);
    setSelectedStation(station);
  }, []);

  const handleSatelliteSelect = useCallback((nextSatellite: Satellite) => {
    setSelectedStation(null);
    setSelectedSatellite(nextSatellite);
  }, []);

  const beginScrub = () => {
    if (isPlaying) {
      setIsPlaying(false);
    }
    isScrubbingRef.current = true;
    throttleRef.current.hasCommittedDuringScrub = false;
    throttleRef.current.lastCommittedAt = performance.now();
  };

  const endScrub = () => {
    if (!isScrubbingRef.current) return;

    isScrubbingRef.current = false;
    commitVisualFrame(pendingFrameIndexRef.current, setVisualFrameIndex, throttleRef);
  };

  const pausePlayback = () => {
    setIsPlaying(false);
  };

  const stepToFrame = (frameIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(lastFrameIndex, frameIndex));
    setPendingFrameIndex(clampedIndex);
    commitVisualFrame(clampedIndex, setVisualFrameIndex, throttleRef);
  };

  const playNextFrame = () => {
    pausePlayback();
    stepToFrame(pendingFrameIndex + 1);
  };

  const playPreviousFrame = () => {
    pausePlayback();
    stepToFrame(pendingFrameIndex - 1);
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
    if (!isPlaying) return;

    playbackIntervalRef.current = window.setInterval(() => {
      setPendingFrameIndex((current) => {
        const nextFrameIndex = Math.min(current + 1, lastFrameIndex);
        commitVisualFrame(nextFrameIndex, setVisualFrameIndex, throttleRef);
        if (nextFrameIndex === lastFrameIndex) {
          setIsPlaying(false);
        }
        return nextFrameIndex;
      });
    }, TIMELINE_PLAYBACK_INTERVAL_MS);

    return () => {
      if (playbackIntervalRef.current !== null) {
        window.clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    };
  }, [isPlaying, lastFrameIndex]);

  useEffect(
    () => () => {
      if (playbackIntervalRef.current !== null) {
        window.clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    },
    [],
  );

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
    pausePlayback();
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
        satellite={satellite}
        frame={visualFrame}
        frames={simulationState.frames}
        physicalConstants={simulationState.physicalConstants}
        selectedStation={selectedStation}
        selectedSatellite={selectedSatellite}
        onGroundStationSelect={handleGroundStationSelect}
        onSatelliteSelect={handleSatelliteSelect}
        controls={
          <button
            type="button"
            className="scene-control-button"
            onClick={() => setAreGraphsVisible((current) => !current)}
            aria-pressed={areGraphsVisible}
            aria-label={areGraphsVisible ? "Hide graphs" : "Show graphs"}
          >
            {areGraphsVisible ? "Hide graphs" : "Show graphs"}
          </button>
        }
      />

      {areGraphsVisible ? (
        <CrossLayerInsights
          frames={simulationState.frames}
          pendingFrameIndex={pendingFrameIndex}
          visualFrameIndex={visualFrameIndex}
          onFrameInput={handleFrameInput}
        />
      ) : null}

      {selectedStation ? (
        <GroundStationCard
          station={selectedStation}
          currentUnixMs={visualFrame.currentUnixMs}
          derivedState={visualFrame.groundStation}
          hardwareState={visualFrame.hardware}
          linkState={visualFrame.link}
          onClose={() => setSelectedStation(null)}
        />
      ) : null}

      {selectedSatellite ? (
        <SatelliteCard
          satellite={selectedSatellite}
          currentUnixMs={visualFrame.currentUnixMs}
          frameState={visualFrame.satellite}
          hardwareState={visualFrame.hardware}
          sunState={visualFrame.sun}
          onClose={() => setSelectedSatellite(null)}
        />
      ) : null}

      <SimulationTimeline
        clock={simulationState.clock}
        frames={simulationState.frames}
        pendingFrameIndex={pendingFrameIndex}
        visualFrameIndex={visualFrameIndex}
        isPlaying={isPlaying}
        onFrameInput={handleFrameInput}
        onScrubStart={beginScrub}
        onNextFrame={playNextFrame}
        onPreviousFrame={playPreviousFrame}
        onPlayToggle={() => {
          if (isPlaying) {
            setIsPlaying(false);
            return;
          }
          if (pendingFrameIndex === lastFrameIndex) return;
          setIsPlaying(true);
        }}
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

function toSatellite(tle: TleElements): Satellite {
  return {
    id: "satellite",
    name: tle.name,
    tle,
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
