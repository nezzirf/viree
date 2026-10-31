"use client";
/** Groupe de choix exclusifs (boutons radio accessibles, grosses zones tactiles). */
export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  const entries = Object.entries(options) as [T, string][];
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${entries.length}, minmax(0, 1fr))` }} role="radiogroup">
        {entries.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={value === k}
            onClick={() => onChange(k)}
            className={`min-h-14 rounded-2xl border px-1 font-semibold transition-colors ${entries.length > 3 ? "text-[15px]" : "text-base"} ${
              value === k ? "border-lime bg-lime text-night" : "border-line bg-raised text-ink"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
