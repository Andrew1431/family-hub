import type { KVStore } from "@hub/sdk";
import type { Db } from "./db.js";

/** camelCase / kebab → UPPER_SNAKE, for env-var names. */
function envSegment(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toUpperCase();
}

// ── low-level kv helpers over the `kv` table ─────────────────────────────────
function kvGet(db: Db, scope: string, ns: string, key: string): unknown {
  const row = db.get<{ value: string }>(
    "SELECT value FROM kv WHERE scope = ? AND ns = ? AND key = ?",
    scope,
    ns,
    key,
  );
  return row ? JSON.parse(row.value) : undefined;
}

function kvSet(db: Db, scope: string, ns: string, key: string, value: unknown): void {
  db.run(
    `INSERT INTO kv (scope, ns, key, value) VALUES (?, ?, ?, ?)
     ON CONFLICT(scope, ns, key) DO UPDATE SET value = excluded.value`,
    scope,
    ns,
    key,
    JSON.stringify(value),
  );
}

function kvAll(db: Db, scope: string, ns: string): Record<string, unknown> {
  const rows = db.all<{ key: string; value: string }>(
    "SELECT key, value FROM kv WHERE scope = ? AND ns = ?",
    scope,
    ns,
  );
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = JSON.parse(r.value);
  return out;
}

/**
 * Per-module settings. Resolution order: DB override (set at runtime, e.g. by a
 * settings UI) → file defaults (merged config.template.json + config.local.json).
 * Reads are human-editable via the local file; writes persist to the DB so they
 * survive without rewriting the user's file.
 */
export function makeConfigStore(
  db: Db,
  ns: string,
  defaults: Record<string, unknown>,
): KVStore {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const dbVal = kvGet(db, "config", ns, key);
      if (dbVal !== undefined) return dbVal as T;
      return key in defaults ? (defaults[key] as T) : undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      kvSet(db, "config", ns, key, value);
    },
    async delete(key: string): Promise<void> {
      db.run("DELETE FROM kv WHERE scope = ? AND ns = ? AND key = ?", "config", ns, key);
    },
    async all<T>(): Promise<Record<string, T>> {
      return { ...(defaults as Record<string, T>), ...(kvAll(db, "config", ns) as Record<string, T>) };
    },
  };
}

/**
 * Per-module secrets. Resolution order: `HUB_<MODULE>_<KEY>` env → declared env
 * alias (e.g. ANTHROPIC_API_KEY) → runtime store (for tokens fetched via OAuth).
 * Secrets are never read from committed/seeded files and never sent to the UI.
 */
export function makeSecretStore(
  db: Db,
  ns: string,
  aliases: Record<string, string> = {},
): KVStore {
  const envName = (key: string) => `HUB_${envSegment(ns)}_${envSegment(key)}`;
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const direct = process.env[envName(key)];
      if (direct !== undefined) return direct as T;
      const alias = aliases[key];
      if (alias && process.env[alias] !== undefined) return process.env[alias] as T;
      return kvGet(db, "secret", ns, key) as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      kvSet(db, "secret", ns, key, value);
    },
    async delete(key: string): Promise<void> {
      db.run("DELETE FROM kv WHERE scope = ? AND ns = ? AND key = ?", "secret", ns, key);
    },
    async all<T>(): Promise<Record<string, T>> {
      return kvAll(db, "secret", ns) as Record<string, T>;
    },
  };
}
