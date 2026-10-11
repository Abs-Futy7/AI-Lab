"use client";

import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

import { graphCoverageBounds, graphCoverageFromMetadata, graphCoverageLabel, type GraphCoverage } from "@/lib/graph-coverage";
import type { Coordinates, SearchResult } from "@/types/routing";
import { GraphCoverageOverlay } from "./GraphCoverageOverlay";
import { PlaybackCamera } from "./PlaybackCamera";

function FitExperiment({ result, source, destination, graphCoverage }: { result: SearchResult; source: Coordinates; destination: Coordinates; graphCoverage: GraphCoverage | null }) {
  const map = useMap();
  useEffect(() => {
    const points: Array<[number, number]> = graphCoverage
      ? graphCoverageBounds(graphCoverage)
      : result.path.length > 1
      ? result.path.map((point) => [point.lat, point.lng] as [number, number])
      : [[source.lat, source.lon], [destination.lat, destination.lon]] as Array<[number, number]>;
    const fit = () => {
      map.invalidateSize({ pan: false });
      map.fitBounds(points, { padding: [22, 22] });
    };
    const frame = window.requestAnimationFrame(fit);
    const delayedRefresh = window.setTimeout(() => map.invalidateSize({ pan: false }), 250);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delayedRefresh);
    };
  }, [destination.lat, destination.lon, graphCoverage, map, result, source.lat, source.lon]);
  return null;
}

function KeepMapSized() {
  const map = useMap();

  useEffect(() => {
    const refresh = () => map.invalidateSize({ pan: false });
    const observer = new ResizeObserver(refresh);
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  return null;
}

export default function AlgorithmSimulationMap({
  result,
  source,
  destination,
  playbackStep,
  color,
}: {
  result: SearchResult;
  source: Coordinates;
  destination: Coordinates;
  playbackStep: number;
  color: string;
}) {
  const expandedCount = Math.min(playbackStep, result.expanded_nodes.length);
  const graphCoverage = useMemo(
    () => graphCoverageFromMetadata(result.scenario_metadata),
    [result.scenario_metadata],
  );
  const routeCount = Math.max(0, playbackStep - result.expanded_nodes.length);
  const visibleRoute = result.path.slice(0, routeCount);
  const currentNode = expandedCount > 0 && playbackStep <= result.expanded_nodes.length
    ? result.expanded_nodes[expandedCount - 1]
    : null;
  const expanded = useMemo(() => {
    const locations = new Map<string, { lat: number; lng: number }>();
    for (const node of result.expanded_nodes.slice(0, expandedCount)) {
      locations.set(`${node.lat}:${node.lng}`, node);
    }
    return [...locations.values()];
  }, [expandedCount, result]);

  return (
    <div className="algorithm-map-shell">
      <MapContainer center={[source.lat, source.lon]} zoom={14} zoomControl={false} attributionControl={false} className="algorithm-mini-map">
        <TileLayer attribution="OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <KeepMapSized />
        <FitExperiment result={result} source={source} destination={destination} graphCoverage={graphCoverage} />
        <PlaybackCamera result={result} playbackStep={playbackStep} targetZoom={16} />
        {graphCoverage && <GraphCoverageOverlay coverage={graphCoverage} color={color} />}
        {expanded.map((node, index) => (
          <CircleMarker key={`${node.lat}-${node.lng}-${index}`} center={[node.lat, node.lng]} radius={2.5} pathOptions={{ color, fillColor: color, fillOpacity: 0.48, weight: 1 }} />
        ))}
        {currentNode && (
          <CircleMarker center={[currentNode.lat, currentNode.lng]} radius={6.5} className="current-node-pulse" pathOptions={{ color: "#fff", fillColor: color, fillOpacity: 1, weight: 2.5 }}>
            <Tooltip direction="top" permanent={false}>Currently expanding</Tooltip>
          </CircleMarker>
        )}
        {visibleRoute.length > 1 && (
          <Polyline positions={visibleRoute.map((node) => [node.lat, node.lng])} pathOptions={{ color, opacity: 0.95, weight: 5 }} />
        )}
        <CircleMarker center={[source.lat, source.lon]} radius={6} pathOptions={{ color: "#fff", fillColor: "#16a34a", fillOpacity: 1, weight: 2 }}><Tooltip>Source</Tooltip></CircleMarker>
        <CircleMarker center={[destination.lat, destination.lon]} radius={6} pathOptions={{ color: "#fff", fillColor: "#dc2626", fillOpacity: 1, weight: 2 }}><Tooltip>Destination</Tooltip></CircleMarker>
      </MapContainer>
      {graphCoverage && <div className="graph-coverage-caption">Radius coverage · {graphCoverageLabel(graphCoverage)}</div>}
    </div>
  );
}
