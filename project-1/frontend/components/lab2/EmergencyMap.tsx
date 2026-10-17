"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";

import type { Lab2Allocation, Lab2Center, Lab2Incident } from "@/types/lab2";

const routeColors: Record<string, string> = {
  AMBULANCE: "#2563eb", FIRE_UNIT: "#e11d48", RESCUE_TEAM: "#059669",
};

function AutoFrame({ centers, incidents }: { centers: Lab2Center[]; incidents: Lab2Incident[] }) {
  const map = useMap();
  useEffect(() => {
    const points = [
      ...centers.map((item) => [item.latitude, item.longitude] as [number, number]),
      ...incidents.map((item) => [item.latitude, item.longitude] as [number, number]),
    ];
    if (points.length) map.fitBounds(latLngBounds(points), { padding: [30, 30], maxZoom: 15, animate: false });
  }, [centers, incidents, map]);
  return null;
}

export default function EmergencyMap({
  centers, incidents, allocations,
}: {
  centers: Lab2Center[]; incidents: Lab2Incident[]; allocations: Lab2Allocation[];
}) {
  return (
    <div className="lab2-map-frame">
      <MapContainer center={[23.7338, 90.395]} zoom={14} className="lab2-map" zoomControl>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <AutoFrame centers={centers} incidents={incidents} />
        {allocations.map((allocation) => (
          <Polyline
            key={allocation.variable}
            positions={allocation.route.map((point) => [point.lat, point.lng])}
            pathOptions={{ color: routeColors[allocation.resource_type] ?? "#7c3aed", weight: 3, opacity: .72 }}
          >
            <Tooltip>{allocation.resource_id} → {allocation.incident_id} · {allocation.travel_time_minutes} min</Tooltip>
          </Polyline>
        ))}
        {centers.map((center) => (
          <CircleMarker key={center.id} center={[center.latitude, center.longitude]} radius={9}
            pathOptions={{ color: "#0f172a", fillColor: routeColors[center.center_type] ?? "#475569", fillOpacity: .95, weight: 2 }}>
            <Tooltip direction="top"><strong>{center.name}</strong><br />{center.center_type.replaceAll("_", " ")}</Tooltip>
          </CircleMarker>
        ))}
        {incidents.map((incident) => (
          <CircleMarker key={incident.id} center={[incident.latitude, incident.longitude]} radius={4 + incident.severity}
            pathOptions={{ color: "#fff", fillColor: incident.severity >= 4 ? "#dc2626" : "#f59e0b", fillOpacity: .9, weight: 2 }}>
            <Tooltip direction="top"><strong>{incident.id} · {incident.type.replaceAll("_", " ")}</strong><br />Severity {incident.severity} · {incident.deadline_minutes} min</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="lab2-map-legend">
        <span><i className="legend-center" /> Resource center</span>
        <span><i className="legend-incident" /> Incident</span>
        <span><i className="legend-route" /> Live allocation route</span>
      </div>
    </div>
  );
}
