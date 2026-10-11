export interface GraphCoverage {
  centerLat: number;
  centerLon: number;
  radiusM: number;
}

export function graphCoverageFromMetadata(metadata: Record<string, string | number>): GraphCoverage | null {
  const coverage: GraphCoverage = {
    centerLat: Number(metadata.graph_center_lat),
    centerLon: Number(metadata.graph_center_lon),
    radiusM: Number(metadata.graph_radius_m),
  };
  if (!Object.values(coverage).every(Number.isFinite) || coverage.radiusM <= 0) return null;
  return coverage;
}

export function graphCoverageLabel(coverage: GraphCoverage): string {
  return `${(coverage.radiusM / 1000).toFixed(2)} km radius`;
}

export function graphCoverageBounds(coverage: GraphCoverage): Array<[number, number]> {
  const latitudeDelta = coverage.radiusM / 111_320;
  const longitudeScale = Math.max(0.01, Math.cos(coverage.centerLat * Math.PI / 180));
  const longitudeDelta = coverage.radiusM / (111_320 * longitudeScale);
  return [
    [coverage.centerLat - latitudeDelta, coverage.centerLon - longitudeDelta],
    [coverage.centerLat + latitudeDelta, coverage.centerLon + longitudeDelta],
  ];
}
