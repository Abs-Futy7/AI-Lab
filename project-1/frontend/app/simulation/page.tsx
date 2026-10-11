import type { Metadata } from "next";
import { Suspense } from "react";
import "leaflet/dist/leaflet.css";
import "./simulation.css";

import ComparisonSimulation from "@/components/routing/ComparisonSimulation";
import type { ComparisonRequest, CostWeights, NetworkScale, Scenario } from "@/types/routing";

export const metadata: Metadata = {
  title: "Six-Way Live Search Simulation",
  description: "Synchronized live visualization of six AI graph-search algorithms",
};

const scenarios: Scenario[] = ["normal", "medium_traffic", "heavy_traffic", "flood", "high_risk", "combined_emergency"];
const scales: NetworkScale[] = ["small", "medium", "full"];

function value(input: string | string[] | undefined): string | undefined {
  return Array.isArray(input) ? input[0] : input;
}

function number(input: string | string[] | undefined, fallback: number): number {
  const parsed = Number(value(input));
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function SimulationPageContent({ searchParams }: PageProps<"/simulation">) {
  const query = await searchParams;
  const candidateWeights: CostWeights = {
    distance: number(query.w_distance, 0.3),
    traffic: number(query.w_traffic, 0.4),
    condition: number(query.w_condition, 0.2),
    risk: number(query.w_risk, 0.1),
  };
  const weightSum = Object.values(candidateWeights).reduce((sum, weight) => sum + weight, 0);
  const weights: CostWeights = Math.abs(weightSum - 1) < 0.001
    ? candidateWeights
    : { distance: 0.3, traffic: 0.4, condition: 0.2, risk: 0.1 };
  const scenarioValue = value(query.scenario) as Scenario | undefined;
  const scaleValue = value(query.network_scale) as NetworkScale | undefined;
  const request: ComparisonRequest = {
    source_lat: number(query.source_lat, 23.7338),
    source_lon: number(query.source_lon, 90.3928),
    destination_lat: number(query.destination_lat, 23.7257),
    destination_lon: number(query.destination_lon, 90.398),
    scenario: scenarioValue && scenarios.includes(scenarioValue) ? scenarioValue : "normal",
    network_scale: scaleValue && scales.includes(scaleValue) ? scaleValue : "full",
    weights,
  };
  return <ComparisonSimulation request={request} />;
}

export default function SimulationPage(props: PageProps<"/simulation">) {
  return (
    <Suspense fallback={<main className="comparison-loading"><p>Preparing the six-way simulation…</p></main>}>
      <SimulationPageContent {...props} />
    </Suspense>
  );
}
