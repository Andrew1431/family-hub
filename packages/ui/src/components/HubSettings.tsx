import { useMemo, useState } from "react";
import type { ModuleManifest } from "@hub/sdk";
import { Field, IconArrowLeft, Segmented, Select, TextInput, ToggleRow } from "@hub/components";
import { updateConfig, type HubConfig } from "../lib/api";
import { discoverThemes, type ThemeInfo } from "../lib/themes";
import { moduleFrontends } from "../modules.generated";

/**
 * The central Settings hub, rendered inside the shell's SettingsModal. Two
 * levels in one modal:
 *   1. "Hub" (app toggles) + "Theme" + a "Modules" list of every loaded
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
          <IconArrowLeft size={14} /> {manifest?.title ?? openModule}
        </button>
        {ModSettings ? (
          <ModSettings moduleName={openModule} onClose={() => setOpenModule(null)} />
        ) : (
          <p className="text-sm text-base-content/55">This module has no settings.</p>
        )}
      </div>
    );
  }

  // ── Top level: Hub toggles + Theme + the Modules list ─────────────────────
  const configurable = modules.filter((m) => moduleFrontends[m.name]?.Settings);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <div className="panel-label">Hub</div>
        <ToggleRow
          label="Family assistant"
          hint="Enable the AI assistant. When off, the orb and Spacebar shortcut are disabled and the panels grow to fill the space."
          checked={config.showAssistant}
          disabled={saving}
          onChange={(v) => void patch({ showAssistant: v })}
        />
        {config.showAssistant && (
          <ToggleRow
            label="Show the orb"
            hint={
              <>
                Show the copper orb at the bottom of the dashboard. When off, pressing{" "}
                <kbd className="kbd kbd-xs">space</kbd> still opens the assistant.
              </>
            }
            checked={config.showOrb !== false}
            disabled={saving}
            onChange={(v) => void patch({ showOrb: v })}
          />
        )}
        {error && <p className="text-xs text-error">{error}</p>}
      </section>

      <ThemeSettings config={config} saving={saving} patch={patch} />

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

// ── Theme section ────────────────────────────────────────────────────────────

function ThemeSettings({
  config,
  saving,
  patch,
}: {
  config: HubConfig;
  saving: boolean;
  patch: (next: Partial<HubConfig>) => Promise<void>;
}) {
  // Themes come from the stylesheet, so a custom block in theme.local.css
  // appears here without any code change.
  const themes = useMemo(discoverThemes, []);
  const auto = config.themeMode === "auto";

  return (
    <section className="flex flex-col gap-3">
      <div className="panel-label">Theme</div>
      <Segmented
        value={auto}
        options={[
          { value: false, label: "One theme" },
          { value: true, label: "Day & night" },
        ]}
        onChange={(v) => void patch({ themeMode: v ? "auto" : "single" })}
      />

      {!auto ? (
        <ThemeGrid
          themes={themes}
          selected={config.theme}
          disabled={saving}
          onSelect={(name) => void patch({ theme: name })}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day theme">
              <Select
                value={config.themeDay ?? "hearth-day"}
                disabled={saving}
                onChange={(e) => void patch({ themeDay: e.target.value })}
              >
                {themes.map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Night theme">
              <Select
                value={config.themeNight ?? "hearth-night"}
                disabled={saving}
                onChange={(e) => void patch({ themeNight: e.target.value })}
              >
                {themes.map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Day starts">
              <TextInput
                type="time"
                value={config.dayStart ?? "07:00"}
                disabled={saving}
                onChange={(e) => void patch({ dayStart: e.target.value })}
              />
            </Field>
            <Field label="Night starts">
              <TextInput
                type="time"
                value={config.nightStart ?? "21:00"}
                disabled={saving}
                onChange={(e) => void patch({ nightStart: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-xs text-base-content/50">
            The display follows the wall clock: the day theme from day start, the night theme
            from night start.
          </p>
        </div>
      )}
    </section>
  );
}

function ThemeGrid({
  themes,
  selected,
  disabled,
  onSelect,
}: {
  themes: ThemeInfo[];
  selected: string;
  disabled: boolean;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {themes.map((t) => {
        const active = t.name === selected;
        return (
          <button
            key={t.name}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onSelect(t.name)}
            className={`flex flex-col gap-1.5 rounded-xl border p-2 text-left transition-colors ${
              active
                ? "border-primary/60 bg-primary/10"
                : "border-base-content/10 bg-base-content/5 hover:border-base-content/25"
            }`}
          >
            {/* Live swatch: canvas chip with a raised panel + accent dots. */}
            <span
              className="flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-black/10"
              style={{ backgroundColor: t.swatch.base }}
              aria-hidden
            >
              <span
                className="flex h-6 items-center gap-1 rounded-md px-1.5"
                style={{ backgroundColor: t.swatch.panel }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.swatch.primary }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.swatch.accent }} />
                <span className="h-1 w-4 rounded-full opacity-60" style={{ backgroundColor: t.swatch.text }} />
              </span>
            </span>
            <span className="flex items-center justify-between gap-1">
              <span className={`truncate text-xs font-medium ${active ? "text-primary" : "text-base-content/80"}`}>
                {t.name}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-base-content/40">
                {t.scheme}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
