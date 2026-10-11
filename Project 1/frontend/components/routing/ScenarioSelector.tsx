import type { Scenario } from "@/types/routing";

const scenarios: Array<{ value: Scenario; label: string }> = [
  { value: "normal", label: "Normal operations" },
  { value: "medium_traffic", label: "Medium traffic" },
  { value: "heavy_traffic", label: "Extreme / heavy traffic" },
  { value: "flood", label: "Flood / road closures" },
  { value: "high_risk", label: "High-risk zones" },
  { value: "combined_emergency", label: "Combined emergency" },
];

export function ScenarioSelector({
  value,
  onChange,
}: {
  value: Scenario;
  onChange: (value: Scenario) => void;
}) {
  return (
    <label className="field-label">
      <span>Road scenario</span>
      <select
        className="select-field"
        value={value}
        onChange={(event) => onChange(event.target.value as Scenario)}
      >
        {scenarios.map((scenario) => (
          <option key={scenario.value} value={scenario.value}>
            {scenario.label}
          </option>
        ))}
      </select>
    </label>
  );
}
