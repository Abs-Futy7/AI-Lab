import type { NetworkScale } from "@/types/routing";

const scales: Array<{ value: NetworkScale; label: string }> = [
  { value: "small", label: "Small · about 500 nodes" },
  { value: "medium", label: "Medium · about 2,000 nodes" },
  { value: "full", label: "Full · all available nodes" },
];

export function NetworkScaleSelector({ value, onChange }: { value: NetworkScale; onChange: (value: NetworkScale) => void }) {
  return (
    <label className="field-label">
      <span>Experiment graph size</span>
      <select className="select-field" value={value} onChange={(event) => onChange(event.target.value as NetworkScale)}>
        {scales.map((scale) => <option key={scale.value} value={scale.value}>{scale.label}</option>)}
      </select>
    </label>
  );
}
