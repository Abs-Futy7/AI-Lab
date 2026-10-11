"use client";

import { Circle, Tooltip } from "react-leaflet";

import { graphCoverageLabel, type GraphCoverage } from "@/lib/graph-coverage";

export function GraphCoverageOverlay({ coverage, color = "#2563eb" }: { coverage: GraphCoverage; color?: string }) {
  return (
    <Circle
      center={[coverage.centerLat, coverage.centerLon]}
      radius={coverage.radiusM}
      pathOptions={{ color, weight: 2.5, opacity: 0.95, fillOpacity: 0, dashArray: "9 7" }}
    >
      <Tooltip className="graph-coverage-tooltip" sticky>Radius coverage · {graphCoverageLabel(coverage)}</Tooltip>
    </Circle>
  );
}
