import { BrainCircuit } from "lucide-react";

import type { Algorithm, SearchResult } from "@/types/routing";

export function HeuristicCard({ result, algorithm }: { result: SearchResult | null; algorithm: Algorithm }) {
  const usesHeuristic = (result?.algorithm ?? algorithm) === "astar" || (result?.algorithm ?? algorithm) === "greedy";
  return (
    <section className="panel heuristic-card">
      <div className="heuristic-icon"><BrainCircuit size={20} /></div>
      <div><span className="eyebrow">Heuristic model</span>
        {usesHeuristic ? <><code>h(n) = w<sub>d</sub> × haversine(n, goal)</code><p>{result?.heuristic_explanation ?? "Straight-line distance is an optimistic lower bound because all added penalties are nonnegative."}</p></> : <p>This algorithm does not use h(n). Its expansion rule is determined by its own frontier discipline.</p>}
      </div>
    </section>
  );
}
