import type { Logger } from "@hub/sdk";

const LEVELS = ["debug", "info", "warn", "error"] as const;
type Level = (typeof LEVELS)[number];

function emit(ns: string, level: Level, msg: string, meta?: unknown): void {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} (${ns}) ${msg}`;
  const args = meta === undefined ? [line] : [line, meta];
  if (level === "error") console.error(...args);
  else if (level === "warn") console.warn(...args);
  else console.log(...args);
}

/** Build a namespaced logger (namespace is usually the module name). */
export function makeLogger(ns: string): Logger {
  return {
    debug: (m, meta) => emit(ns, "debug", m, meta),
    info: (m, meta) => emit(ns, "info", m, meta),
    warn: (m, meta) => emit(ns, "warn", m, meta),
    error: (m, meta) => emit(ns, "error", m, meta),
  };
}
