import { X } from "lucide-react";
import { formatCoordinate } from "../lib/geo";
import type { GroundStation } from "../types";
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
  onClose: () => void;
};

export function GroundStationCard({ station, onClose }: GroundStationCardProps) {
  return (
    <Card className="station-card">
      <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
        <X size={16} />
      </button>
      <CardHeader>
        <CardDescription>Ground station</CardDescription>
        <CardTitle>{station.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="metric-grid">
          <Metric label="Latitude" value={formatCoordinate(station.latDeg, "N", "S")} />
          <Metric label="Longitude" value={formatCoordinate(station.lonDeg, "E", "W")} />
          <Metric label="Altitude" value={`${station.altitudeM.toLocaleString()} m`} />
          <Metric label="Min elevation" value={`${station.minElevationDeg}°`} />
        </div>
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
