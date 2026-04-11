import type { GroundStationDerivedState } from "../../state";
import { X } from "lucide-react";
import { formatCoordinate } from "../lib/geo";
import type { GroundStation } from "../types";
import {
  formatAzimuth,
  formatDegrees,
  formatDistanceMeters,
  formatFrequencyHz,
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
  onClose: () => void;
};

export function GroundStationCard({
  station,
  currentUnixMs,
  derivedState,
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
          <Metric label="Pass state" value={derivedState.inPass ? "In pass" : "Out of pass"} />
        </div>

        <Accordion
          type="multiple"
          defaultValue={["location", "visibility", "pass", "antenna", "geometry"]}
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

function formatFrameIndex(value: number | null) {
  return value === null ? "N/A" : String(value);
}

function formatDurationSeconds(value: number) {
  return `${value.toFixed(0)} s`;
}
