"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";

import type { Lab3Point } from "@/types/lab3";

function Frame({ baseline, route }: { baseline: Lab3Point[]; route: Lab3Point[] }) {
  const map = useMap();
  useEffect(() => {
    const points = [...baseline, ...route];
    if (points.length > 1) {
      map.fitBounds(latLngBounds(points.map((point) => [point.lat, point.lng])), {
        padding: [28, 28], maxZoom: 17, animate: false,
      });
    }
  }, [baseline, map, route]);
  return null;
}

export default function AdversarialMap({
  baseline, route = [], compact = false,
}: { baseline: Lab3Point[]; route?: Lab3Point[]; compact?: boolean }) {
  const source = baseline[0];
  const destination = baseline.at(-1);
  return (
    <div className={`lab3-map-frame${compact ? " compact" : ""}`}>
      <MapContainer center={[23.7338, 90.395]} zoom={14} className="lab3-map" zoomControl={!compact}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Frame baseline={baseline} route={route} />
        {baseline.length > 1 && <Polyline positions={baseline.map((point) => [point.lat, point.lng])} pathOptions={{ color: "#64748b", weight: 5, opacity: .55, dashArray: "9 8" }}><Tooltip>Frozen Lab 2 route</Tooltip></Polyline>}
        {route.length > 1 && <Polyline positions={route.map((point) => [point.lat, point.lng])} pathOptions={{ color: "#1546d9", weight: 6, opacity: .92 }}><Tooltip>MAX response under disruption</Tooltip></Polyline>}
        {source && <CircleMarker center={[source.lat, source.lng]} radius={8} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#16a34a", fillOpacity: 1 }}><Tooltip direction="top">Start: frozen Lab 2 resource</Tooltip></CircleMarker>}
        {destination && <CircleMarker center={[destination.lat, destination.lng]} radius={8} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#dc2626", fillOpacity: 1 }}><Tooltip direction="top">Goal: Lab 2 incident</Tooltip></CircleMarker>}
        {route.slice(1, -1).map((point, index) => <CircleMarker key={`${point.lat}-${point.lng}-${index}`} center={[point.lat, point.lng]} radius={3.5} pathOptions={{ color: "#1546d9", fillColor: "#ffffff", fillOpacity: 1 }}><Tooltip>Decision step {index + 1}</Tooltip></CircleMarker>)}
      </MapContainer>
      <div className="lab3-map-legend"><span><i className="start" /> Start</span><span><i className="goal" /> Goal</span><span><b className="baseline" /> Lab 2 route</span><span><b className="selected" /> Game route</span></div>
    </div>
  );
}
