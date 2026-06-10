import { useState } from "react";
import type { ModuleManifest, DashboardConfig, WidgetInstance } from "@hub/sdk";
import { moduleFrontends } from "../modules.generated";
import { SettingsModal } from "./SettingsModal";

function span(start: number | undefined, length: number): string {
  return start ? `${start} / span ${length}` : `span ${length}`;
}

export function DashboardGrid({
  dashboard,
  modules,
  defaults,
}: {
  dashboard: DashboardConfig;
  /** Module name → manifest, for surface/title lookup. */
  modules: Record<string, ModuleManifest>;
  /** Top-level grid defaults a dashboard may override. */
  defaults: { columns: number; rows?: number };
}) {
  const [settingsFor, setSettingsFor] = useState<WidgetInstance | null>(null);

  const cols = dashboard.columns ?? defaults.columns;
  const rows = dashboard.rows ?? defaults.rows;

  const settingsModule = settingsFor ? modules[settingsFor.module] : undefined;
  const SettingsComp = settingsFor ? moduleFrontends[settingsFor.module]?.Settings : undefined;

  return (
    <div
      className="grid flex-1 min-h-0"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        // Fixed row count → proportional rows that fill the display.
        // Otherwise rows grow to fit content.
        ...(rows
          ? { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }
          : { gridAutoRows: "minmax(90px, auto)" }),
        gap: "clamp(12px, 2vw, 24px)",
      }}
    >
      {dashboard.widgets.map((w) => {
        const manifest = modules[w.module];
        const entry = moduleFrontends[w.module];
        const bare = manifest?.surface === "bare";
        const hasSettings = Boolean(entry?.Settings);
        const settings = w.settings ?? {};
        return (
          <section
            key={w.id}
            className={
              (bare ? "" : "panel p-[clamp(14px,1.6vw,22px)] ") +
              "group relative flex flex-col min-h-0 overflow-hidden"
            }
            style={{ gridColumn: span(w.col, w.w), gridRow: span(w.row, w.h) }}
          >
            {/* Settings cog — only for modules that define Settings, and only
                visible on hover / keyboard focus within the card. */}
            {hasSettings && (
              <button
                type="button"
                onClick={() => setSettingsFor(w)}
                aria-label={`${manifest?.title ?? w.module} settings`}
                className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-lg
                           text-base-content/45 opacity-0 transition-opacity duration-150
                           hover:bg-base-content/10 hover:text-base-content/80
                           focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            )}

            {entry ? (
              <entry.Panel moduleName={w.module} instanceId={w.id} settings={settings} />
            ) : (
              <div className="panel-label">{manifest?.title ?? w.module} — no frontend loaded</div>
            )}
          </section>
        );
      })}

      {settingsFor && SettingsComp && (
        <SettingsModal title={settingsModule?.title ?? settingsFor.module} onClose={() => setSettingsFor(null)}>
          <SettingsComp moduleName={settingsFor.module} onClose={() => setSettingsFor(null)} />
        </SettingsModal>
      )}
    </div>
  );
}
