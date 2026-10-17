"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";

import type { Lab2Allocation, Lab2Center, Lab2Incident } from "@/types/lab2";

const routeColors: Record<string, string> = {
  AMBULANCE: "#2563eb", FIRE_UNIT: "#e11d48", RESCUE_TEAM: "#059669",
};

const centerSymbols: Record<string, string> = {
  AMBULANCE: "🚑", FIRE_UNIT: "🚒", RESCUE_TEAM: "🛟",
};

const incidentSymbols: Record<string, string> = {
  MEDICAL: "✚", FIRE: "🔥", ROAD_ACCIDENT: "⚠️", FLOOD_RESCUE: "🌊",
};

function signedMarker(symbol: string, kind: string, critical = false) {
  return divIcon({
    className: "emergency-marker-shell",
    html: `<span class="emergency-map-marker ${kind}${critical ? " critical" : ""}">${symbol}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    tooltipAnchor: [0, -16],
  });
}

function AutoFrame({ centers, incidents }: { centers: Lab2Center[]; incidents: Lab2Incident[] }) {
  const map = useMap();
  useEffect(() => {
    const points = [
      ...centers.map((item) => [item.latitude, item.longitude] as [number, number]),
      ...incidents.map((item) => [item.latitude, item.longitude] as [number, number]),
    ];
    if (points.length) {
      map.fitBounds(latLngBounds(points), { padding: [18, 18], maxZoom: 16, animate: false });
      map.setZoom(Math.min(map.getZoom() + 1, 16), { animate: false });
    }
  }, [centers, incidents, map]);
  return null;
}

export default function EmergencyMap({
  centers, incidents, allocations, activeCenterId, activeIncidentId,
}: {
  centers: Lab2Center[]; incidents: Lab2Incident[]; allocations: Lab2Allocation[];
  activeCenterId?: string; activeIncidentId?: string;
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
          <Marker key={center.id} position={[center.latitude, center.longitude]}
            icon={signedMarker(centerSymbols[center.center_type] ?? "✚", `center ${center.center_type.toLowerCase()}${center.id === activeCenterId ? " active" : ""}`)}>
            <Tooltip direction="top"><strong>{center.name}</strong><br />{center.center_type.replaceAll("_", " ")}</Tooltip>
          </Marker>
        ))}
        {incidents.map((incident) => (
          <Marker key={incident.id} position={[incident.latitude, incident.longitude]}
            icon={signedMarker(incidentSymbols[incident.type] ?? "!", `incident ${incident.type.toLowerCase()}${incident.id === activeIncidentId ? " active" : ""}`, incident.severity >= 4)}>
            <Tooltip direction="top"><strong>{incident.id} · {incident.type.replaceAll("_", " ")}</strong><br />Severity {incident.severity} · {incident.deadline_minutes} min<br />Assigned: {allocations.filter((item) => item.incident_id === incident.id).map((item) => item.resource_id).join(", ") || "pending"}</Tooltip>
          </Marker>
        ))}
      </MapContainer>
      <div className="lab2-map-legend">
        <span><b>🚑</b> Ambulance / medical</span>
        <span><b>🚒</b> Fire service</span>
        <span><b>🛟</b> Rescue</span>
        <span><b>⚠️</b> Incident</span>
        <span><i className="legend-route" /> Live allocation route</span>
      </div>
    </div>
  );
}
