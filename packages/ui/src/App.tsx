import { useEffect, useState } from "react";
import type { ModuleManifest, LayoutConfig } from "@hub/sdk";
import { fetchModules, fetchLayout, fetchConfig, type HubConfig } from "./lib/api";
import { DashboardGrid } from "./components/DashboardGrid";
import { Header } from "./components/Header";
import { AssistantOrb } from "./components/AssistantOrb";
import { ChatModal } from "./components/ChatModal";

/** Return to the Home (first) dashboard after this long with no interaction. */
const INACTIVITY_RESET_MS = 60_000 * 5;

export default function App() {
  const [modules, setModules] = useState<ModuleManifest[] | null>(null);
  const [layout, setLayout] = useState<LayoutConfig | null>(null);
  const [config, setConfig] = useState<HubConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    Promise.all([fetchModules(), fetchLayout(), fetchConfig()])
      .then(([m, l, c]) => {
        setModules(m);
        setLayout(l);
        setConfig(c);
        setActiveId(l.dashboards[0]?.id ?? "");
        if (c.theme) document.documentElement.dataset.theme = c.theme;
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Idle wall mirror: drift back to Home (first dashboard) after inactivity.
  const homeId = layout?.dashboards[0]?.id;
  useEffect(() => {
    if (!homeId || activeId === homeId) return;
    let timer: number;
    const reset = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setActiveId(homeId), INACTIVITY_RESET_MS);
    };
    const events = ["pointerdown", "keydown", "pointermove", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [homeId, activeId]);

  // Spacebar opens the assistant — but never while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || chatOpen) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      e.preventDefault();
      setChatOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatOpen]);

  if (error) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="panel p-8 max-w-md">
          <div className="panel-label mb-2">Can't reach the hub</div>
          <p className="text-base-content/70 text-sm">{error}</p>
          <p className="text-base-content/50 text-xs mt-3">
            Is the core server running? (<code>pnpm --filter @hub/core dev</code>)
          </p>
        </div>
      </div>
    );
  }

  if (!modules || !layout || !config) {
    return (
      <div className="grid h-full place-items-center">
        <span className="loading loading-ring loading-lg text-primary" />
      </div>
    );
  }

  const moduleMap = Object.fromEntries(modules.map((m) => [m.name, m]));
  const active = layout.dashboards.find((d) => d.id === activeId) ?? layout.dashboards[0];

  return (
    <div className="flex h-full flex-col gap-[clamp(16px,2.5vw,28px)] overflow-hidden p-[clamp(20px,4vw,48px)]">
      <Header dashboards={layout.dashboards} activeId={active?.id ?? ""} onSelect={setActiveId} />
      {active && (
        <DashboardGrid
          dashboard={active}
          modules={moduleMap}
          defaults={{ columns: layout.columns, ...(layout.rows ? { rows: layout.rows } : {}) }}
        />
      )}
      <footer className="flex justify-center">
        <AssistantOrb onClick={() => setChatOpen(true)} />
      </footer>
      {chatOpen && <ChatModal onClose={() => setChatOpen(false)} />}
    </div>
  );
}
