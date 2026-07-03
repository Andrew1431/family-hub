import { useEffect } from "react";
import type { HubConfig } from "./api";

/**
 * Applies the configured theme to <html data-theme>. Two modes:
 *   • "single" — always `config.theme`.
 *   • "auto"   — `themeDay` from `dayStart` until `nightStart`, then
 *                `themeNight`; re-checked each minute on the wall clock.
 */

function minutesOf(hhmm: string | undefined, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return fallback;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function resolveTheme(config: HubConfig, now = new Date()): string {
  if (config.themeMode !== "auto") return config.theme || "hearth";
  const day = minutesOf(config.dayStart, 7 * 60);
  const night = minutesOf(config.nightStart, 21 * 60);
  const cur = now.getHours() * 60 + now.getMinutes();
  // Day window may wrap midnight (e.g. day 07:00 → night 21:00, or an owl's
  // day 22:00 → night 04:00); treat [day, night) as the day span either way.
  const isDay = day <= night ? cur >= day && cur < night : cur >= day || cur < night;
  return (isDay ? config.themeDay : config.themeNight) || config.theme || "hearth";
}

export function useTheme(config: HubConfig | null): void {
  useEffect(() => {
    if (!config) return;
    const apply = () => {
      const next = resolveTheme(config);
      if (document.documentElement.dataset.theme !== next) {
        document.documentElement.dataset.theme = next;
      }
    };
    apply();
    if (config.themeMode !== "auto") return;
    const t = setInterval(apply, 30_000);
    return () => clearInterval(t);
  }, [config]);
}
