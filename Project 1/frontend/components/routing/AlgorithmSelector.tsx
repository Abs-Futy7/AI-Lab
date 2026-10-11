import type { Algorithm } from "@/types/routing";

const algorithms: Array<{ value: Algorithm; label: string; note: string }> = [
  { value: "bfs", label: "BFS", note: "Minimum hops" },
  { value: "dfs", label: "DFS", note: "Deep first route" },
  { value: "ucs", label: "UCS", note: "Minimum g(n)" },
  { value: "ids", label: "IDS", note: "Increasing depth" },
  { value: "greedy", label: "Greedy", note: "Minimum h(n)" },
  { value: "astar", label: "A*", note: "Minimum g(n) + h(n)" },
];

export function AlgorithmSelector({
  value,
  onChange,
}: {
  value: Algorithm;
  onChange: (value: Algorithm) => void;
}) {
  return (
    <label className="field-label">
      <span>Search algorithm</span>
      <select
        className="select-field"
        value={value}
        onChange={(event) => onChange(event.target.value as Algorithm)}
      >
        {algorithms.map((algorithm) => (
          <option key={algorithm.value} value={algorithm.value}>
            {algorithm.label} · {algorithm.note}
          </option>
        ))}
      </select>
    </label>
  );
}
