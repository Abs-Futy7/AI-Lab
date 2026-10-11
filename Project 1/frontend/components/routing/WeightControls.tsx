import type { CostWeights } from "@/types/routing";

const fields: Array<{ key: keyof CostWeights; label: string; color: string }> = [
  { key: "distance", label: "Distance", color: "#2563eb" },
  { key: "traffic", label: "Traffic", color: "#f97316" },
  { key: "condition", label: "Road condition", color: "#d97706" },
  { key: "risk", label: "Safety risk", color: "#e11d48" },
];

export function WeightControls({ value, onChange }: { value: CostWeights; onChange: (value: CostWeights) => void }) {
  const total = Object.values(value).reduce((sum, item) => sum + item, 0);
  const valid = Math.abs(total - 1) < 0.001;
  return (
    <div className="weights-block">
      <div className="section-row">
        <span className="section-title">Cost weights</span>
        <span className={valid ? "weight-total valid" : "weight-total invalid"}>Σ {total.toFixed(2)}</span>
      </div>
      {fields.map((field) => (
        <label className="slider-row" key={field.key}>
          <span>{field.label}</span>
          <output>{value[field.key].toFixed(2)}</output>
          <input
            style={{ accentColor: field.color }}
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={value[field.key]}
            onChange={(event) => onChange({ ...value, [field.key]: Number(event.target.value) })}
          />
        </label>
      ))}
      {!valid && <p className="validation-note">Weights must total 1.00 before running.</p>}
    </div>
  );
}
