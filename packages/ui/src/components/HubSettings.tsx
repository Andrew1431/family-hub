import { useState } from "react";
import type { ModuleManifest } from "@hub/sdk";
import { updateConfig, type HubConfig } from "../lib/api";
import { moduleFrontends } from "../modules.generated";

/**
 * The central Settings hub, rendered inside the shell's SettingsModal. Two
 * levels in one modal:
 *   1. A "Hub" section (app-level toggles) + a "Modules" list of every loaded
 *      module that ships a Settings component.
 *   2. Drill into a module → its Settings, with a back arrow.
 *
 * Because backends mount regardless of placement, a module's settings are
 * reachable here whether or not it sits on a dashboard — which is the only way
 * to configure placement-less modules (e.g. a screensaver).
 */
export function HubSettings({
  config,
  modules,
  onChange,
}: {
  config: HubConfig;
  /** All loaded module manifests, for the Modules list. */
  modules: ModuleManifest[];
  /** Lift the saved config back into App so chrome updates immediately. */
  onChange: (next: HubConfig) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openModule, setOpenModule] = useState<string | null>(null);

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

  // ── Drilled into a module: render its Settings with a back arrow ───────────
  if (openModule) {
    const ModSettings = moduleFrontends[openModule]?.Settings;
    const manifest = modules.find((m) => m.name === openModule);
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setOpenModule(null)}
          className="flex items-center gap-1.5 self-start text-sm text-base-content/55 hover:text-base-content"
        >
          <span aria-hidden>←</span> {manifest?.title ?? openModule}
        </button>
        {ModSettings ? (
          <ModSettings moduleName={openModule} onClose={() => setOpenModule(null)} />
        ) : (
          <p className="text-sm text-base-content/55">This module has no settings.</p>
        )}
      </div>
    );
  }

  // ── Top level: Hub toggles + the Modules list ─────────────────────────────
  const configurable = modules.filter((m) => moduleFrontends[m.name]?.Settings);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <div className="panel-label">Hub</div>
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
      </section>

      {configurable.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="panel-label">Modules</div>
          <ul className="flex flex-col gap-1.5">
            {configurable.map((m) => (
              <li key={m.name}>
                <button
                  type="button"
                  onClick={() => setOpenModule(m.name)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-base-content/10
                             bg-base-content/5 px-3.5 py-2.5 text-left transition-colors
                             hover:border-base-content/20 hover:bg-base-content/10"
                >
                  <span>
                    <span className="block font-sans text-sm font-medium text-base-content">
                      {m.title}
                    </span>
                    {m.description && (
                      <span className="mt-0.5 block text-xs text-base-content/55">{m.description}</span>
                    )}
                  </span>
                  <span aria-hidden className="text-base-content/35">→</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
