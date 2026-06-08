import type { ModuleManifest, LayoutConfig, GridPlacement } from "@hub/sdk";
import { moduleFrontends } from "../modules.generated";

function placementFor(m: ModuleManifest, layout: LayoutConfig): GridPlacement {
  const explicit = layout.panels[m.name];
  if (explicit) return explicit;
  const size = m.defaultSize ?? { w: 4, h: 2 };
  return { w: size.w, h: size.h };
}

function orderModules(modules: ModuleManifest[], layout: LayoutConfig): ModuleManifest[] {
  const order = layout.order ?? [];
  return [...modules].sort((a, b) => {
    const ia = order.indexOf(a.name);
    const ib = order.indexOf(b.name);
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  });
}

function span(start: number | undefined, length: number): string {
  return start ? `${start} / span ${length}` : `span ${length}`;
}

export function DashboardGrid({
  modules,
  layout,
}: {
  modules: ModuleManifest[];
  layout: LayoutConfig;
}) {
  const cols = layout.columns ?? 12;
  return (
    <div
      className="grid flex-1 min-h-0"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        // Fixed row count → proportional rows that fill the display.
        // Otherwise rows grow to fit content.
        ...(layout.rows
          ? { gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))` }
          : { gridAutoRows: "minmax(90px, auto)" }),
        gap: "clamp(12px, 2vw, 24px)",
      }}
    >
      {orderModules(modules, layout).map((m) => {
        const p = placementFor(m, layout);
        const entry = moduleFrontends[m.name];
        const bare = m.surface === "bare";
        return (
          <section
            key={m.name}
            className={
              (bare ? "" : "panel p-5 ") + "flex flex-col min-h-0 overflow-hidden"
            }
            style={{ gridColumn: span(p.col, p.w), gridRow: span(p.row, p.h) }}
          >
            {entry ? (
              <entry.Panel moduleName={m.name} />
            ) : (
              <div className="panel-label">{m.title} — no frontend loaded</div>
            )}
          </section>
        );
      })}
    </div>
  );
}
