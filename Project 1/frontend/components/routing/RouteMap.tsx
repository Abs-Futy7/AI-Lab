"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";

import type { Coordinates, LayerVisibility, SearchResult } from "@/types/routing";
import { graphCoverageBounds, graphCoverageFromMetadata, graphCoverageLabel, type GraphCoverage } from "@/lib/graph-coverage";
import { GraphCoverageOverlay } from "./GraphCoverageOverlay";
import { PlaybackCamera } from "./PlaybackCamera";

function pointIcon(color: string, label: string) {
  return L.divIcon({
    className: "location-marker-shell",
    html: `<div class="location-marker" style="--marker:${color}"><span>${label}</span></div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
  });
}

function MapClick({ onClick }: { onClick: (point: Coordinates) => void }) {
  useMapEvents({ click: (event) => onClick({ lat: event.latlng.lat, lon: event.latlng.lng }) });
  return null;
}

function FitRoute({ result, graphCoverage }: { result: SearchResult | null; graphCoverage: GraphCoverage | null }) {
  const map = useMap();
  useEffect(() => {
    if (graphCoverage) {
      map.fitBounds(graphCoverageBounds(graphCoverage), { padding: [30, 30] });
    } else if (result && result.path.length > 1) {
      map.fitBounds(result.path.map((point) => [point.lat, point.lng]), { padding: [42, 42] });
    }
  }, [graphCoverage, map, result]);
  return null;
}

export default function RouteMap({
  source,
  destination,
  result,
  layers,
  pickMode,
  playbackStep,
  onMapClick,
}: {
  source: Coordinates;
  destination: Coordinates;
  result: SearchResult | null;
  layers: LayerVisibility;
  pickMode: "source" | "destination" | null;
  playbackStep: number;
  onMapClick: (point: Coordinates) => void;
}) {
  const expandedCount = Math.min(playbackStep, result?.expanded_nodes.length ?? 0);
  const graphCoverage = useMemo(
    () => result ? graphCoverageFromMetadata(result.scenario_metadata) : null,
    [result],
  );
  const visiblePathCount = Math.max(0, playbackStep - (result?.expanded_nodes.length ?? 0));
  const visiblePath = result?.path.slice(0, visiblePathCount) ?? [];
  const currentExpandedNode = expandedCount > 0 && expandedCount <= (result?.expanded_nodes.length ?? 0)
    ? result?.expanded_nodes[expandedCount - 1]
    : null;
  const expanded = useMemo(() => {
    const unique = new Map<string, { lat: number; lng: number }>();
    for (const point of result?.expanded_nodes.slice(0, expandedCount) ?? []) unique.set(`${point.lat}:${point.lng}`, point);
    return [...unique.values()];
  }, [expandedCount, result]);
  return (
    <div className={pickMode ? "map-frame picking" : "map-frame"}>
      <MapContainer center={[23.733, 90.395]} zoom={14} scrollWheelZoom className="route-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClick onClick={onMapClick} />
        <FitRoute result={result} graphCoverage={graphCoverage} />
        {result && <PlaybackCamera result={result} playbackStep={playbackStep} enabled={layers.autoFrame} targetZoom={16} />}
        {graphCoverage && layers.graphCoverage && <GraphCoverageOverlay coverage={graphCoverage} />}
        {result && layers.blocked && result.road_layers.blocked.map((line, index) => (
          <Polyline key={`blocked-${index}`} positions={line.map((point) => [point.lat, point.lng])} pathOptions={{ color: "#dc2626", weight: 5, opacity: 0.82, dashArray: "7 6" }} />
        ))}
        {result && layers.traffic && result.road_layers.heavy_traffic.map((line, index) => (
          <Polyline key={`traffic-${index}`} positions={line.map((point) => [point.lat, point.lng])} pathOptions={{ color: "#f97316", weight: 5, opacity: 0.72 }} />
        ))}
        {result && layers.risk && result.road_layers.high_risk.map((line, index) => (
          <Polyline key={`risk-${index}`} positions={line.map((point) => [point.lat, point.lng])} pathOptions={{ color: "#e11d48", weight: 4, opacity: 0.68, dashArray: "3 7" }} />
        ))}
        {result && layers.expanded && expanded.map((point, index) => (
          <CircleMarker key={`${point.lat}-${point.lng}-${index}`} center={[point.lat, point.lng]} radius={3.2} pathOptions={{ color: "#0891b2", fillColor: "#22d3ee", fillOpacity: 0.58, weight: 1 }} />
        ))}
        {layers.expanded && currentExpandedNode && expandedCount <= (result?.expanded_nodes.length ?? 0) && playbackStep <= (result?.expanded_nodes.length ?? 0) && (
          <CircleMarker center={[currentExpandedNode.lat, currentExpandedNode.lng]} radius={7} className="current-node-pulse" pathOptions={{ color: "#0e7490", fillColor: "#67e8f9", fillOpacity: 0.95, weight: 3 }} />
        )}
        {result && layers.route && visiblePath.length > 1 && (
          <Polyline positions={visiblePath.map((point) => [point.lat, point.lng])} pathOptions={{ color: "#1d4ed8", weight: 7, opacity: 0.92 }} />
        )}
        <Marker position={[source.lat, source.lon]} icon={pointIcon("#16a34a", "S")}><Tooltip>Source</Tooltip></Marker>
        <Marker position={[destination.lat, destination.lon]} icon={pointIcon("#dc2626", "D")}><Tooltip>Destination</Tooltip></Marker>
      </MapContainer>
      {graphCoverage && layers.graphCoverage && (
        <div className="graph-coverage-summary">
          <strong>{String(result?.scenario_metadata.network_scale ?? "full")} graph coverage</strong>
          <span>{graphCoverageLabel(graphCoverage)} · {Number(result?.scenario_metadata.node_count ?? 0).toLocaleString()} nodes</span>
        </div>
      )}
      <div className="map-legend">
        <span><i className="legend-coverage" /> Radius coverage</span>
        <span><i className="legend-line route" /> Route</span>
        <span><i className="legend-dot expanded" /> Expanded</span>
        <span><i className="legend-line blocked" /> Blocked</span>
        <span><i className="legend-line traffic" /> Traffic</span>
        <span><i className="legend-line risk" /> Risk</span>
      </div>
      {pickMode && <div className="map-pick-notice">Click the map to set {pickMode}</div>}
    </div>
  );
}
