import { Crosshair } from "lucide-react";

import type { Coordinates } from "@/types/routing";

export const PRESETS: Record<string, Coordinates> = {
  "University of Dhaka": { lat: 23.7338, lon: 90.3928 },
  "Dhaka Medical College": { lat: 23.7257, lon: 90.3980 },
  Shahbagh: { lat: 23.7381, lon: 90.3958 },
  Dhanmondi: { lat: 23.7465, lon: 90.3760 },
  Farmgate: { lat: 23.7580, lon: 90.3906 },
};

export function LocationSelector({
  label,
  value,
  onChange,
  picking,
  onPick,
}: {
  label: string;
  value: Coordinates;
  onChange: (value: Coordinates) => void;
  picking: boolean;
  onPick: () => void;
}) {
  return (
    <fieldset className="location-fieldset">
      <div className="location-head">
        <legend>{label}</legend>
        <button className={picking ? "pick-button active" : "pick-button"} onClick={onPick} type="button">
          <Crosshair size={13} /> {picking ? "Click map" : "Pick"}
        </button>
      </div>
      <select
        className="select-field compact"
        value=""
        onChange={(event) => {
          const preset = PRESETS[event.target.value];
          if (preset) onChange(preset);
        }}
        aria-label={`${label} quick preset`}
      >
        <option value="">Quick preset…</option>
        {Object.keys(PRESETS).map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
      <div className="coordinate-grid">
        <label>
          <span>LAT</span>
          <input
            type="number"
            step="0.0001"
            value={value.lat}
            onChange={(event) => onChange({ ...value, lat: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>LNG</span>
          <input
            type="number"
            step="0.0001"
            value={value.lon}
            onChange={(event) => onChange({ ...value, lon: Number(event.target.value) })}
          />
        </label>
      </div>
    </fieldset>
  );
}
