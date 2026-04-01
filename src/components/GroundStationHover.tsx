import { formatCoordinate } from "../lib/geo";
import type { GroundStation } from "../types";

type GroundStationHoverProps = {
  hover: {
    station: GroundStation;
    x: number;
    y: number;
  };
};

export function GroundStationHover({ hover }: GroundStationHoverProps) {
  const { station, x, y } = hover;

  return (
    <div
      className="station-tooltip"
      style={{ left: x + 14, top: y + 14 }}
      role="status"
    >
      <strong>{station.name}</strong>
      <span>{formatCoordinate(station.latDeg, "N", "S")}</span>
      <span>{formatCoordinate(station.lonDeg, "E", "W")}</span>
      <span>Min elevation {station.minElevationDeg}°</span>
    </div>
  );
}
