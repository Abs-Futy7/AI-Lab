import { BookOpenCheck } from "lucide-react";

const assumptions = [
  "Nodes are road junctions; directed edges are drivable road segments.",
  "Distance comes from OpenStreetMap; traffic, condition, and risk are simulated.",
  "Scenario generation uses a fixed seed for reproducible comparisons.",
  "Blocked roads are unavailable actions, never high-cost shortcuts.",
  "Weights are user-controlled and every penalty is nonnegative.",
  "The task is modeled as goal-based graph search, not live dispatch advice.",
];

export function AssumptionsCard() {
  return <section className="panel assumptions-panel"><div className="assumption-title"><BookOpenCheck size={20} /><div><span className="eyebrow">Lab notes</span><h2>Assumptions & model</h2></div></div><p>A shorter road is not always the fastest or safest emergency route. Weighted cost lets congestion, flooding, road damage, and risk justify a longer detour.</p><ul>{assumptions.map((item) => <li key={item}>{item}</li>)}</ul></section>;
}
