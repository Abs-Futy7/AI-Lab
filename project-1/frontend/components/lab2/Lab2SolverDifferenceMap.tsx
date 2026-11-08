"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";
import { GitCompareArrows, MapPinned } from "lucide-react";

import type { CSPAlgorithm, Lab2Allocation, Lab2Result, Lab2Scenario } from "@/types/lab2";

const solverStyles: Record<CSPAlgorithm, { label: string; short: string; color: string; dashArray?: string }> = {
  backtracking: { label: "Backtracking", short: "BT", color: "#2563eb" },
  backjumping: { label: "Conflict-Directed Backjumping", short: "CBJ", color: "#f97316", dashArray: "12 7" },
  local_search: { label: "Min-Conflicts", short: "MC", color: "#7c3aed", dashArray: "3 7" },
};

const solverKeys = Object.keys(solverStyles) as CSPAlgorithm[];

interface DifferenceRecord {
  variable: string;
  incidentId: string;
  choices: Record<CSPAlgorithm, Lab2Allocation | null>;
}

function DifferenceFrame({ records, visible }: { records: DifferenceRecord[]; visible: Record<CSPAlgorithm, boolean> }) {
  const map = useMap();

  const points = useMemo(() => records.flatMap((record) => solverKeys.flatMap((key) => {
    if (!visible[key]) return [];
    const allocation = record.choices[key];
    return allocation ? allocation.route.map((point) => [point.lat, point.lng] as [number, number]) : [];
  })), [records, visible]);

  useEffect(() => {
    if (points.length) {
      map.fitBounds(latLngBounds(points), { padding: [32, 32], maxZoom: 16, animate: false });
    }
  }, [map, points]);

  return null;
}

function choiceLabel(allocation: Lab2Allocation | null) {
  return allocation ? `${allocation.resource_id} · ${allocation.travel_time_minutes.toFixed(1)} min` : "Unallocated";
}

export default function Lab2SolverDifferenceMap({
  scenario,
  comparison,
}: {
  scenario: Lab2Scenario;
  comparison: Record<CSPAlgorithm, Lab2Result>;
}) {
  const [selectedVariable, setSelectedVariable] = useState("all");
  const [visible, setVisible] = useState<Record<CSPAlgorithm, boolean>>({
    backtracking: true,
    backjumping: true,
    local_search: true,
  });

  const { allVariables, differences } = useMemo(() => {
    const variables = new Set<string>();
    const allocations = {} as Record<CSPAlgorithm, Map<string, Lab2Allocation>>;
    const unallocated = {} as Record<CSPAlgorithm, Map<string, string>>;

    solverKeys.forEach((key) => {
      allocations[key] = new Map(comparison[key].allocations.map((item) => [item.variable, item]));
      unallocated[key] = new Map(comparison[key].unallocated.map((item) => [item.variable, item.incident_id]));
      comparison[key].allocations.forEach((item) => variables.add(item.variable));
      comparison[key].unallocated.forEach((item) => variables.add(item.variable));
    });

    const records = [...variables].sort().flatMap((variable): DifferenceRecord[] => {
      const choices = {} as Record<CSPAlgorithm, Lab2Allocation | null>;
      solverKeys.forEach((key) => { choices[key] = allocations[key].get(variable) ?? null; });
      const signatures = new Set(solverKeys.map((key) => choices[key]?.resource_id ?? "UNALLOCATED"));
      if (signatures.size === 1) return [];
      const incidentId = solverKeys.map((key) => choices[key]?.incident_id ?? unallocated[key].get(variable)).find(Boolean) ?? variable;
      return [{ variable, incidentId, choices }];
    });

    return { allVariables: variables.size, differences: records };
  }, [comparison]);

  const displayed = selectedVariable === "all"
    ? differences
    : differences.filter((item) => item.variable === selectedVariable);
  const allocationGaps = differences.filter((item) => solverKeys.some((key) => !item.choices[key])).length;
  const agreementCount = allVariables - differences.length;

  function toggleSolver(key: CSPAlgorithm) {
    setVisible((current) => {
      const enabled = solverKeys.filter((solver) => current[solver]);
      if (current[key] && enabled.length === 1) return current;
      return { ...current, [key]: !current[key] };
    });
  }

  return (
    <section className="lab2-panel solver-difference-section">
      <header className="solver-difference-heading">
        <div>
          <span className="eyebrow">Spatial decision comparison</span>
          <h2><GitCompareArrows size={21} /> Solver route difference map</h2>
          <p>Only requirements where the three CSP algorithms chose different resources—or left one unallocated—are drawn. Routes that all solvers agree on are intentionally hidden.</p>
        </div>
        <div className="difference-summary" aria-label="Route comparison summary">
          <span><strong>{differences.length}</strong><small>Differing requirements</small></span>
          <span><strong>{agreementCount}</strong><small>Full agreements</small></span>
          <span><strong>{allocationGaps}</strong><small>Allocation gaps</small></span>
        </div>
      </header>

      {differences.length === 0 ? (
        <div className="difference-empty-state">
          <MapPinned size={27} />
          <div><strong>All three solvers made the same route decisions</strong><p>There are no solver-specific routes to highlight for this scenario.</p></div>
        </div>
      ) : (
        <>
          <div className="difference-controls">
            <label>
              Inspect requirement
              <select value={selectedVariable} onChange={(event) => setSelectedVariable(event.target.value)}>
                <option value="all">All {differences.length} differing requirements</option>
                {differences.map((item) => <option key={item.variable} value={item.variable}>{item.variable} · {item.incidentId}</option>)}
              </select>
            </label>
            <div className="difference-solver-toggles" aria-label="Visible solvers">
              {solverKeys.map((key) => {
                const style = solverStyles[key];
                return <button key={key} type="button" aria-pressed={visible[key]} onClick={() => toggleSolver(key)} style={{ "--difference-color": style.color } as React.CSSProperties}>
                  <i className={style.dashArray === "12 7" ? "dashed" : style.dashArray ? "dotted" : "solid"} />
                  {style.short} · {style.label}
                </button>;
              })}
            </div>
          </div>

          <div className="difference-map-frame">
            <MapContainer center={[23.7338, 90.395]} zoom={14} className="difference-map" zoomControl>
              <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <DifferenceFrame records={displayed} visible={visible} />
              {displayed.flatMap((record) => solverKeys.flatMap((key) => {
                const allocation = record.choices[key];
                if (!visible[key] || !allocation) return [];
                const style = solverStyles[key];
                return [
                  <Polyline
                    key={`${record.variable}-${key}`}
                    positions={allocation.route.map((point) => [point.lat, point.lng])}
                    pathOptions={{ color: style.color, weight: 5, opacity: .82, dashArray: style.dashArray, lineCap: "round" }}
                  >
                    <Tooltip sticky><strong>{style.label}</strong><br />{record.variable}<br />{allocation.resource_id} → {allocation.incident_id}<br />Response: {allocation.travel_time_minutes.toFixed(1)} min</Tooltip>
                  </Polyline>,
                  <CircleMarker key={`${record.variable}-${key}-source`} center={[allocation.source.lat, allocation.source.lng]} radius={5} pathOptions={{ color: "#fff", weight: 2, fillColor: style.color, fillOpacity: 1 }}>
                    <Tooltip><strong>{style.short} source</strong><br />{allocation.resource_id}</Tooltip>
                  </CircleMarker>,
                ];
              }))}
              {displayed.map((record) => {
                const allocation = solverKeys.map((key) => record.choices[key]).find(Boolean);
                const incident = scenario.incidents.find((item) => item.id === record.incidentId);
                const destination = allocation?.destination ?? (incident ? { lat: incident.latitude, lng: incident.longitude } : null);
                if (!destination) return null;
                return <CircleMarker key={`${record.variable}-incident`} center={[destination.lat, destination.lng]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#dc2626", fillOpacity: 1 }}>
                  <Tooltip direction="top">
                    <strong>{record.variable}</strong><br />Incident: {record.incidentId}<br />
                    {solverKeys.map((key) => <span key={key} className="difference-tooltip-row"><b style={{ color: solverStyles[key].color }}>{solverStyles[key].short}</b> {choiceLabel(record.choices[key])}<br /></span>)}
                  </Tooltip>
                </CircleMarker>;
              })}
            </MapContainer>
            <div className="difference-map-legend">
              <strong>Only disagreements shown</strong>
              <span><i className="bt" /> BT solid</span>
              <span><i className="cbj" /> CBJ dashed</span>
              <span><i className="mc" /> MC dotted</span>
              <span><b /> Incident / requirement</span>
            </div>
          </div>
          <p className="difference-map-note">Select one requirement to isolate the exact roads and resource origins. Click a red incident point to compare all three assignments side by side.</p>
        </>
      )}
    </section>
  );
}
