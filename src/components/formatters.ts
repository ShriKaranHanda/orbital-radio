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

export function formatDb(value: number) {
  return `${value.toFixed(2)} dB`;
}

export function formatSignedDb(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} dB`;
}

export function formatPowerDbw(value: number) {
  return `${value.toFixed(2)} dBW`;
}

export function formatPowerWatts(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)} MW`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)} kW`;
  }

  return `${value.toFixed(1)} W`;
}

export function formatBitRate(value: number) {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)} Gbps`;
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)} Mbps`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)} kbps`;
  }

  return `${value.toFixed(0)} bps`;
}

export function formatPacketRate(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)} Mpps`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)} kpps`;
  }

  return `${value.toFixed(1)} pps`;
}

export function formatPacketCount(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  });
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatProbability(value: number) {
  if (value <= 0) {
    return "0";
  }

  if (value >= 0.01) {
    return `${(value * 100).toFixed(2)}%`;
  }

  return value.toExponential(2);
}

export function formatTemperatureC(value: number) {
  return `${value.toFixed(1)} °C`;
}

export function formatSeconds(value: number) {
  if (value >= 1) {
    return `${value.toFixed(2)} s`;
  }

  return `${(value * 1_000).toFixed(1)} ms`;
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
