import { useState } from "react";
import { updateConfig, type HubConfig } from "../lib/api";

/**
 * App-level (hub) settings, rendered inside the shell's SettingsModal. Distinct
 * from per-module settings (those live behind each card's cog). Persists via
 * PUT /api/config → hub.local.json, read live by the core.
 */
export function HubSettings({
  config,
  onChange,
}: {
  config: HubConfig;
  /** Lift the saved config back into App so chrome updates immediately. */
  onChange: (next: HubConfig) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(next: Partial<HubConfig>) {
    setSaving(true);
    setError(null);
    try {
      onChange(await updateConfig(next));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="block font-sans text-sm font-medium text-base-content">
            Family assistant
          </span>
          <span className="mt-0.5 block text-xs text-base-content/55">
            Show the AI chat orb at the bottom of the dashboard. When off, the panels
            grow to fill the space and the assistant is fully hidden.
          </span>
        </span>
        <input
          type="checkbox"
          className="toggle toggle-primary mt-0.5 shrink-0"
          checked={config.showAssistant}
          disabled={saving}
          onChange={(e) => patch({ showAssistant: e.target.checked })}
        />
      </label>

      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
