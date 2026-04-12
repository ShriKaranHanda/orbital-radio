import { useState } from "react";
import { GlobeScene } from "./components/GlobeScene";
import { GroundStationCard } from "./components/GroundStationCard";
import { GroundStationHover } from "./components/GroundStationHover";
import type { GroundStation } from "./types";

const groundStation: GroundStation = {
  id: "gs-bengaluru",
  name: "Bengaluru Ground Station",
  latDeg: 12.9716,
  lonDeg: 77.5946,
  altitudeM: 920,
  minElevationDeg: 25,
};

export function App() {
  const [selectedStation, setSelectedStation] = useState<GroundStation | null>(null);
  const [hover, setHover] = useState<{
    station: GroundStation;
    x: number;
    y: number;
  } | null>(null);

  return (
    <main className="app-shell">
      <GlobeScene
        groundStation={groundStation}
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
    </main>
  );
}
