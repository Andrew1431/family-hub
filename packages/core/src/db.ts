import { DatabaseSync } from "node:sqlite";

/**
 * Thin synchronous SQLite handle. Backed by Node's built-in `node:sqlite`
 * (no native build step). On Bun this is the seam where `bun:sqlite` would
 * be swapped in; the surface used by the rest of core is intentionally tiny.
 */
export interface Db {
  exec(sql: string): void;
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[];
  run(sql: string, ...params: unknown[]): void;
}

export function openDb(path: string): Db {
  const sqlite = new DatabaseSync(path);
  return {
    exec: (sql) => sqlite.exec(sql),
    get: <T>(sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).get(...(params as never[])) as T | undefined,
    all: <T>(sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).all(...(params as never[])) as T[],
    run: (sql, ...params) => {
      sqlite.prepare(sql).run(...(params as never[]));
    },
  };
}

/** Create the core tables if they do not yet exist. */
export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      scope TEXT NOT NULL,      -- 'config' | 'secret'
      ns    TEXT NOT NULL,      -- module name
      key   TEXT NOT NULL,
      value TEXT NOT NULL,      -- JSON-encoded
      PRIMARY KEY (scope, ns, key)
    );
  `);
}
