"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";

import type { Lab3Disruption, Lab3Point } from "@/types/lab3";

const disruptionColors: Record<string, string> = {
  TRAFFIC_SPIKE: "#f97316",
  WATERLOGGING: "#0891b2",
  BLOCK_ROAD: "#dc2626",
  FALSE_REPORT: "#a21caf",
};

function Frame({ baseline, route }: { baseline: Lab3Point[]; route: Lab3Point[] }) {
  const map = useMap();
  useEffect(() => {
    const points = baseline.length > 1 ? baseline : route;
    if (points.length > 1) {
      map.fitBounds(latLngBounds(points.map((point) => [point.lat, point.lng])), {
        padding: [32, 32], maxZoom: 16, animate: false,
      });
    }
  }, [baseline, map]);
  return null;
}

export default function AdversarialMap({
  baseline, route = [], disruptions = [], focus, compact = false,
}: {
  baseline: Lab3Point[];
  route?: Lab3Point[];
  disruptions?: Lab3Disruption[];
  focus?: Lab3Point;
  compact?: boolean;
}) {
  const source = baseline[0];
  const destination = baseline.at(-1);
  return (
    <div className={`lab3-map-frame${compact ? " compact" : ""}`}>
      <MapContainer center={[23.7338, 90.395]} zoom={14} className="lab3-map" zoomControl={!compact}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Frame baseline={baseline} route={route} />
        {baseline.length > 1 && <>
          <Polyline positions={baseline.map((point) => [point.lat, point.lng])} pathOptions={{ color: "#ffffff", weight: 10, opacity: .9 }} />
          <Polyline positions={baseline.map((point) => [point.lat, point.lng])} pathOptions={{ color: "#7c3aed", weight: 5, opacity: .95, dashArray: "10 8" }}><Tooltip>Frozen Lab 2 route</Tooltip></Polyline>
        </>}
        {route.length > 1 && <>
          <Polyline positions={route.map((point) => [point.lat, point.lng])} pathOptions={{ color: "#ffffff", weight: 11, opacity: .92 }} />
          <Polyline positions={route.map((point) => [point.lat, point.lng])} pathOptions={{ color: "#1546d9", weight: 6, opacity: 1 }}><Tooltip>Executed adversarial episode route</Tooltip></Polyline>
        </>}
        {disruptions.filter((item) => item.segment?.length === 2).map((item, index) => (
          <Polyline
            key={`${item.edge_id ?? item.type}-${index}`}
            positions={(item.segment ?? []).map((point) => [point.lat, point.lng])}
            pathOptions={{ color: disruptionColors[item.type] ?? "#dc2626", weight: 9, opacity: .9, dashArray: item.type === "BLOCK_ROAD" ? "4 5" : undefined }}
          ><Tooltip>{item.type.replaceAll("_", " ")}</Tooltip></Polyline>
        ))}
        {route.slice(1, -1).map((point, index) => <CircleMarker key={`${point.lat}-${point.lng}-${index}`} center={[point.lat, point.lng]} radius={2.7} pathOptions={{ color: "#1546d9", weight: 1, fillColor: "#ffffff", fillOpacity: 1 }}><Tooltip>MAX road move {index + 1}</Tooltip></CircleMarker>)}
        {source && <CircleMarker center={[source.lat, source.lng]} radius={9} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#16a34a", fillOpacity: 1 }}><Tooltip direction="top">Start: frozen Lab 2 resource</Tooltip></CircleMarker>}
        {destination && <CircleMarker center={[destination.lat, destination.lng]} radius={9} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#dc2626", fillOpacity: 1 }}><Tooltip direction="top">Goal: Lab 2 incident</Tooltip></CircleMarker>}
        {focus && <CircleMarker center={[focus.lat, focus.lng]} radius={11} pathOptions={{ color: "#facc15", weight: 4, fillColor: "#1546d9", fillOpacity: 1 }}><Tooltip direction="top">Current simulated vehicle position</Tooltip></CircleMarker>}
      </MapContainer>
      <div className="lab3-map-legend">
        <span><i className="start" /> Start</span><span><i className="goal" /> Goal</span>
        <span><b className="baseline" /> Lab 2 route</span><span><b className="selected" /> Executed route</span>
        <span><b className="traffic" /> Traffic</span><span><b className="water" /> Water</span><span><b className="block" /> Block</span><span><b className="false-report" /> False report</span>
      </div>
    </div>
  );
}
