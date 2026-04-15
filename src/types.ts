import type { GroundStationConfig, TleElements } from "../state";

export type GroundStation = GroundStationConfig & {
  id: string;
};

export type Satellite = {
  id: string;
  name: string;
  tle: TleElements;
};
