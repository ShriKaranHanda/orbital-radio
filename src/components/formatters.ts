export function formatDegrees(value: number) {
  return `${value.toFixed(1)}°`;
}

export function formatSignedDegrees(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}°`;
}

export function formatAzimuth(value: number) {
  return `${value.toFixed(1)}° from north`;
}

export function formatDistanceMeters(value: number) {
  return `${(value / 1_000).toFixed(1)} km`;
}

export function formatSpeedMetersPerSecond(value: number) {
  return `${value.toFixed(1)} m/s`;
}

export function formatFrequencyHz(value: number) {
  const magnitude = Math.abs(value);

  if (magnitude >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(3)} MHz`;
  }

  if (magnitude >= 1_000) {
    return `${(value / 1_000).toFixed(3)} kHz`;
  }

  return `${value.toFixed(1)} Hz`;
}

export function formatTimestamp(unixMs: number) {
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

export function formatVectorMeters(vector: { x: number; y: number; z: number }) {
  return `${formatScalar(vector.x)}, ${formatScalar(vector.y)}, ${formatScalar(vector.z)} m`;
}

export function formatVectorMetersPerSecond(vector: { x: number; y: number; z: number }) {
  return `${formatScalar(vector.x)}, ${formatScalar(vector.y)}, ${formatScalar(vector.z)} m/s`;
}

function formatScalar(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}
