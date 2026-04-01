import { Vector3 } from "three";

export function latLonToUnitVector(latDeg: number, lonDeg: number) {
  const lat = degToRad(latDeg);
  const lon = degToRad(lonDeg);
  const cosLat = Math.cos(lat);

  return new Vector3(
    cosLat * Math.sin(lon),
    Math.sin(lat),
    cosLat * Math.cos(lon),
  ).normalize();
}

export function formatCoordinate(value: number, positive: string, negative: string) {
  const suffix = value >= 0 ? positive : negative;
  return `${Math.abs(value).toFixed(4)}° ${suffix}`;
}

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}
