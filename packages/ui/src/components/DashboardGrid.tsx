import { useState } from "react";
import type { ModuleManifest, DashboardConfig, WidgetInstance } from "@hub/sdk";
import { moduleFrontends } from "../modules.generated";
import { SettingsModal } from "./SettingsModal";
import type { CSSProperties } from "react";
import {
  Card,
  IconButton,
  IconGear,
  PhotoModeCtx,
  type BackdropSampler,
  type PhotoAnchor,
} from "@hub/components";

const NOT_FLOATING = { active: false, sample: null, anchor: "in-place" as const };

// Same gutter as the App shell's padding, so pinned widgets line up with the grid.
const EDGE = "clamp(20px,4vw,48px)";

/** Fixed-position style that pins a floating card to a screen anchor. */
function anchorStyle(anchor: PhotoAnchor, w: number, cols: number): CSSProperties {
  const width = `calc((100vw - 2 * ${EDGE}) * ${w} / ${cols})`;
  const top = anchor.startsWith("top");
  const s: CSSProperties = {
    position: "fixed",
    gridColumn: "auto",
    gridRow: "auto",
    maxHeight: "48vh",
    width,
    [top ? "top" : "bottom"]: EDGE,
  };
  if (anchor.endsWith("left")) s.left = EDGE;
  else if (anchor.endsWith("right")) s.right = EDGE;
  else {
    // "top" / "bottom": a full-width strip.
    s.left = EDGE;
    s.right = EDGE;
    s.width = "auto";
  }
  return s;
}

function span(start: number | undefined, length: number): string {
  return start ? `${start} / span ${length}` : `span ${length}`;
}

export function DashboardGrid({
  dashboard,
  modules,
  defaults,
  photoMode,
}: {
  dashboard: DashboardConfig;
  /** Module name → manifest, for surface/title lookup. */
  modules: Record<string, ModuleManifest>;
  /** Top-level grid defaults a dashboard may override. */
  defaults: { columns: number; rows?: number };
  /** Screensaver state + which modules float above it. */
  photoMode: { active: boolean; sample: BackdropSampler | null; anchors: Record<string, PhotoAnchor> };
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
        const anchor = photoMode.anchors[w.module];
        const floating = photoMode.active && anchor !== undefined;
        const pinned = floating && anchor !== "in-place";
        const cell = { gridColumn: span(w.col, w.w), gridRow: span(w.row, w.h) };
        return (
          <PhotoModeCtx.Provider key={w.id} value={floating ? { active: true, sample: photoMode.sample, anchor } : NOT_FLOATING}>
            <Card
              instanceId={w.id}
              {...(manifest?.hotkey ? { hotkey: manifest.hotkey } : {})}
              surface={bare ? "bare" : "panel"}
              photoMode={floating}
              style={pinned ? anchorStyle(anchor, w.w, cols) : cell}
            >
              {/* Settings cog — only for modules that define Settings, and only
                  visible on hover / keyboard focus within the card. */}
              {hasSettings && !floating && (
                <IconButton
                  label={`${manifest?.title ?? w.module} settings`}
                  onClick={() => setSettingsFor(w)}
                  className="absolute right-2 top-2 z-10 opacity-0
                             focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <IconGear size={15} />
                </IconButton>
              )}

              {entry ? (
                <entry.Panel moduleName={w.module} instanceId={w.id} settings={settings} />
              ) : (
                <div className="panel-label">{manifest?.title ?? w.module} — no frontend loaded</div>
              )}
            </Card>
          </PhotoModeCtx.Provider>
        );
      })}

      {settingsFor && SettingsComp && (
        <SettingsModal title={settingsModule?.title ?? settingsFor.module} onClose={() => setSettingsFor(null)}>
          <SettingsComp moduleName={settingsFor.module} instanceId={settingsFor.id} onClose={() => setSettingsFor(null)} />
        </SettingsModal>
      )}
    </div>
  );
}
