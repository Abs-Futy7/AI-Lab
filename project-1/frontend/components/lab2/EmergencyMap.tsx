"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";

import type { Lab2Allocation, Lab2Center, Lab2Facility, Lab2Incident } from "@/types/lab2";

const routeColors: Record<string, string> = {
  AMBULANCE: "#2563eb", FIRE_UNIT: "#e11d48", RESCUE_TEAM: "#059669",
};

const centerSymbols: Record<string, string> = {
  AMBULANCE: "🚑", FIRE_UNIT: "🚒", RESCUE_TEAM: "🛟",
};

const incidentSymbols: Record<string, string> = {
  MEDICAL: "✚", FIRE: "🔥", ROAD_ACCIDENT: "⚠️", FLOOD_RESCUE: "🌊",
  EARTHQUAKE: "🏚️", PIT_RESCUE: "🛟",
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

function AutoFrame({ centers, facilities, incidents }: { centers: Lab2Center[]; facilities: Lab2Facility[]; incidents: Lab2Incident[] }) {
  const map = useMap();
  useEffect(() => {
    const points = [
      ...centers.map((item) => [item.latitude, item.longitude] as [number, number]),
      ...facilities.map((item) => [item.latitude, item.longitude] as [number, number]),
      ...incidents.map((item) => [item.latitude, item.longitude] as [number, number]),
    ];
    if (points.length) {
      map.fitBounds(latLngBounds(points), { padding: [18, 18], maxZoom: 16, animate: false });
      map.setZoom(Math.min(map.getZoom() + 1, 16), { animate: false });
    }
  }, [centers, facilities, incidents, map]);
  return null;
}

export default function EmergencyMap({
  centers, facilities, incidents, allocations, activeCenterId, activeIncidentId,
}: {
  centers: Lab2Center[]; facilities: Lab2Facility[]; incidents: Lab2Incident[]; allocations: Lab2Allocation[];
  activeCenterId?: string; activeIncidentId?: string;
}) {
  return (
    <div className="lab2-map-frame">
      <MapContainer center={[23.7338, 90.395]} zoom={14} className="lab2-map" zoomControl>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <AutoFrame centers={centers} facilities={facilities} incidents={incidents} />
        {allocations.map((allocation) => (
          <Polyline
            key={allocation.variable}
            positions={allocation.route.map((point) => [point.lat, point.lng])}
            pathOptions={{ color: routeColors[allocation.resource_type] ?? "#7c3aed", weight: 3, opacity: .72 }}
          >
            <Tooltip>{allocation.resource_id} → {allocation.incident_id} · {allocation.travel_time_minutes} min</Tooltip>
          </Polyline>
        ))}
        {allocations.filter((allocation) => allocation.facility_route?.length).map((allocation) => (
          <Polyline
            key={`${allocation.variable}-facility`}
            positions={(allocation.facility_route ?? []).map((point) => [point.lat, point.lng])}
            pathOptions={{ color: "#dc2626", weight: 3, opacity: .8, dashArray: "8 7" }}
          >
            <Tooltip>{allocation.incident_id} → {allocation.receiving_facility_id}<br />Post-pickup: {allocation.facility_travel_time_minutes?.toFixed(1)} min</Tooltip>
          </Polyline>
        ))}
        {centers.map((center) => (
          <Marker key={center.id} position={[center.latitude, center.longitude]}
            icon={signedMarker(centerSymbols[center.center_type] ?? "✚", `center ${center.center_type.toLowerCase()}${center.id === activeCenterId ? " active" : ""}`)}>
            <Tooltip direction="top"><strong>{center.name}</strong><br />{center.center_type.replaceAll("_", " ")}</Tooltip>
          </Marker>
        ))}
        {facilities.map((facility) => (
          <Marker key={facility.id} position={[facility.latitude, facility.longitude]}
            icon={signedMarker(facility.capabilities.includes("BURN_UNIT") ? "🔥" : "🏥", "facility")}>
            <Tooltip direction="top"><strong>{facility.name}</strong><br />{facility.capabilities.map((item) => item.replaceAll("_", " ")).join(" · ")}<br />Beds ready: {facility.available_beds}/{facility.total_beds}</Tooltip>
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
        <span><i className="legend-hospital-route" /> Patient to facility</span>
      </div>
    </div>
  );
}
