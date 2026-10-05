import { useEffect, useMemo, useState } from "react";
import type { ModuleManifest, LayoutConfig } from "@hub/sdk";
import { fetchModules, fetchLayout, fetchConfig, floatingAnchors, type HubConfig } from "./lib/api";
import { DashboardGrid } from "./components/DashboardGrid";
import { Header } from "./components/Header";
import { AssistantOrb } from "./components/AssistantOrb";
import { ChatModal } from "./components/ChatModal";
import { SettingsModal } from "./components/SettingsModal";
import { HubSettings } from "./components/HubSettings";
import { OverlayHost } from "./components/OverlayHost";
import { HotkeyProvider, IconButton, IconGear, type BackdropSampler } from "@hub/components";
import { useTheme } from "./lib/useTheme";

export default function App() {
  const [modules, setModules] = useState<ModuleManifest[] | null>(null);
  const [layout, setLayout] = useState<LayoutConfig | null>(null);
  const [config, setConfig] = useState<HubConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>("");
  const [overlayActive, setOverlayActive] = useState(false);
  const [backdrop, setBackdrop] = useState<BackdropSampler | null>(null);

  const showAssistant = config?.showAssistant !== false; // default on for older configs
  const showOrb = config?.showOrb !== false; // default on; only meaningful when showAssistant

  useEffect(() => {
    Promise.all([fetchModules(), fetchLayout(), fetchConfig()])
      .then(([m, l, c]) => {
        setModules(m);
        setLayout(l);
        setConfig(c);
        setActiveId(l.dashboards[0]?.id ?? "");
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Applies data-theme; in auto mode re-checks the wall clock each half-minute.
  useTheme(config);

  // Digit keys 1–9 and 0 switch dashboards (1=first, …, 9=ninth, 0=tenth).
  useEffect(() => {
    if (!layout) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.key.match(/^[0-9]$/)) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (chatOpen || settingsOpen) return;
      const idx = e.key === "0" ? 9 : Number(e.key) - 1;
      const target = layout.dashboards[idx];
      if (target) {
        e.preventDefault();
        setActiveId(target.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, chatOpen, settingsOpen]);

  // Spacebar opens the assistant — but never while typing in a field, and not
  // when the assistant is disabled.
  useEffect(() => {
    if (!showAssistant) return;
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
  }, [chatOpen, showAssistant]);

  // These useMemo calls must live before any conditional return — hooks must be
  // called the same number of times on every render.
  const moduleMap = useMemo(
    () => (modules ? Object.fromEntries(modules.map((m) => [m.name, m])) : {}),
    [modules],
  );
  const activeDashboard =
    layout?.dashboards.find((d) => d.id === activeId) ?? layout?.dashboards[0];
  const resolvedHotkeys = useMemo(() => {
    if (!activeDashboard) return {};
    const result: Record<string, string> = {};
    const seen = new Set<string>();
    for (const w of activeDashboard.widgets) {
      const hotkey = moduleMap[w.module]?.hotkey;
      if (!hotkey) continue;
      const key = hotkey.toLowerCase();
      if (seen.has(key)) {
        console.warn(`[HotkeyProvider] hotkey collision on "${key}" — skipping widget "${w.id}"`);
        continue;
      }
      seen.add(key);
      result[w.id] = key;
    }
    return result;
  }, [activeDashboard, moduleMap]);

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

  // After the null guards above, layout/modules/config are non-null.
  // activeDashboard is guaranteed non-null once layout is loaded (dashboards[0] fallback).
  const active = activeDashboard ?? layout.dashboards[0];

  return (
    <div className="relative flex h-full flex-col gap-[clamp(16px,2.5vw,28px)] overflow-hidden p-[clamp(20px,4vw,48px)]">
      {/* Hub settings — dim corner gear, brightens on hover/focus (kept subtle for
          a wall display). Opens the shell SettingsModal with app-level toggles. */}
      <IconButton
        label="Hub settings"
        size="lg"
        onClick={() => setSettingsOpen(true)}
        className="absolute right-3 top-3 z-20 !text-base-content/25 hover:!text-base-content/70 focus-visible:!text-base-content/70"
      >
        <IconGear size={16} />
      </IconButton>

      <Header dashboards={layout.dashboards} activeId={active?.id ?? ""} onSelect={setActiveId} />
      <HotkeyProvider hotkeys={resolvedHotkeys} enabled={!overlayActive && !chatOpen}>
        {active && (
          <DashboardGrid
            dashboard={active}
            modules={moduleMap}
            defaults={{ columns: layout.columns, ...(layout.rows ? { rows: layout.rows } : {}) }}
            photoMode={{
              active: overlayActive,
              sample: backdrop,
              anchors: floatingAnchors(config),
            }}
          />
        )}
      </HotkeyProvider>
      {showAssistant && showOrb && (
        <footer className="flex justify-center">
          <AssistantOrb onClick={() => setChatOpen(true)} />
        </footer>
      )}
      {showAssistant && chatOpen && <ChatModal onClose={() => setChatOpen(false)} />}
      {settingsOpen && (
        <SettingsModal title="Settings" onClose={() => setSettingsOpen(false)}>
          <HubSettings config={config} modules={modules} onChange={setConfig} />
        </SettingsModal>
      )}
      {/* Full-screen module overlays (e.g. the photos screensaver). Each decides
          when to show based on the global idle signal. */}
      <OverlayHost
        modules={modules}
        onActiveChange={setOverlayActive}
        // Functional form: the sampler is itself a function, not an updater.
        onBackdropChange={(s) => setBackdrop(() => s)}
      />
    </div>
  );
}
