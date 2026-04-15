import type { SatelliteFrameState } from "../../state";
import { X } from "lucide-react";
import type { Satellite } from "../types";
import {
  formatTimestamp,
  formatVectorMeters,
  formatVectorMetersPerSecond,
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
  onClose: () => void;
};

export function SatelliteCard({
  satellite,
  currentUnixMs,
  frameState,
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
        </div>

        <Accordion
          type="multiple"
          defaultValue={["identity", "orbit", "eci", "ecef"]}
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
