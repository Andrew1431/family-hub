import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { openDb, migrate } from "./db.js";
import { makeConfigStore } from "./stores.js";
import { loadEnvFile } from "./env.js";
import { GlobalCapabilityRegistry } from "./registry.js";
import { GlobalEventBus } from "./bus.js";
import { loadModules } from "./loader.js";
import { paths } from "./paths.js";
import { makeLogger } from "./logger.js";

const log = makeLogger("server");

export interface ServerOptions {
  port?: number;
  host?: string;
  modulesDir?: string;
  dbPath?: string;
  /** Serve the built UI from disk (production). In dev, Vite serves it. */
  serveUi?: boolean;
}

export async function startServer(opts: ServerOptions = {}): Promise<void> {
  // Load secrets from the gitignored .env before anything reads process.env.
  loadEnvFile(join(paths.repoRoot, ".env"));

  const port = opts.port ?? Number(process.env.PORT ?? 4000);
  const host = opts.host ?? process.env.HOST ?? "0.0.0.0";
  const modulesDir = opts.modulesDir ?? paths.modulesDir;

  if (!existsSync(paths.dataDir)) mkdirSync(paths.dataDir, { recursive: true });
  const dbPath = opts.dbPath ?? join(paths.dataDir, "hub.sqlite");
  const db = openDb(dbPath);
  migrate(db);

  const registry = new GlobalCapabilityRegistry();
  const bus = new GlobalEventBus();

  const app = Fastify({ logger: false });
  await app.register(websocket);

  // Real-time channel: clients receive every published event; inbound
  // messages are dispatched to server-side subscribers.
  app.get("/ws", { websocket: true }, (socket) => {
    const remove = bus.addSocket({ send: (d) => socket.send(d) });
    socket.on("message", (raw: Buffer) => {
      try {
        const { topic, payload } = JSON.parse(raw.toString());
        if (typeof topic === "string") bus.dispatch(topic, payload);
      } catch {
        /* ignore malformed frames */
      }
    });
    socket.on("close", remove);
  });

  const loaded = await loadModules({ app, db, registry, bus, modulesDir });

  // Manifest list for the UI to know which panels to render.
  app.get("/api/modules", async () => loaded.map((m) => m.manifest));
  app.get("/api/health", async () => ({ ok: true, modules: loaded.length }));

  // Runtime config (data, not styling) — served live so edits need no rebuild.
  // Prefers the user's local file, falls back to the committed template.
  const readConfig = (base: string): unknown => {
    const local = join(paths.configDir, `${base}.local.json`);
    const template = join(paths.configDir, `${base}.template.json`);
    return JSON.parse(readFileSync(existsSync(local) ? local : template, "utf8"));
  };
  app.get("/api/layout", async (_req, reply) => {
    try {
      return readConfig("layout");
    } catch {
      return reply.code(500).send({ error: "layout config unreadable" });
    }
  });
  // Hub config is a flat object, so (unlike layout) we merge template defaults
  // under the local override — new keys added to the template surface even when
  // an older hub.local.json predates them.
  const readHubConfig = (): Record<string, unknown> => {
    const template = JSON.parse(readFileSync(join(paths.configDir, "hub.template.json"), "utf8"));
    const localPath = join(paths.configDir, "hub.local.json");
    const local = existsSync(localPath) ? JSON.parse(readFileSync(localPath, "utf8")) : {};
    return { ...template, ...local };
  };
  app.get("/api/config", async (_req, reply) => {
    try {
      return readHubConfig();
    } catch {
      return reply.code(500).send({ error: "hub config unreadable" });
    }
  });
  // Persist a partial hub-config update to hub.local.json (gitignored). Read live
  // by GET above, so a Settings UI takes effect without a rebuild or restart.
  app.put("/api/config", async (req, reply) => {
    const body = req.body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return reply.code(400).send({ error: "body must be a config object" });
    }
    try {
      const localPath = join(paths.configDir, "hub.local.json");
      const base = existsSync(localPath)
        ? JSON.parse(readFileSync(localPath, "utf8"))
        : readHubConfig();
      const merged = { ...base, ...(body as Record<string, unknown>) };
      writeFileSync(localPath, JSON.stringify(merged, null, 2) + "\n");
      return readHubConfig();
    } catch {
      return reply.code(500).send({ error: "hub config unwritable" });
    }
  });

  // Per-module settings: read the merged defaults+overrides, or persist a
  // partial update (settings UIs use this). Non-secret values only — secrets are
  // written through a module's own backend routes and never returned here.
  const moduleByName = new Map(loaded.map((m) => [m.manifest.name, m]));
  const configStoreFor = (name: string) => {
    const mod = moduleByName.get(name);
    return mod ? makeConfigStore(db, name, mod.configDefaults) : undefined;
  };
  app.get("/api/m/:name/config", async (req, reply) => {
    const { name } = req.params as { name: string };
    const store = configStoreFor(name);
    if (!store) return reply.code(404).send({ error: "unknown module" });
    return store.all();
  });
  app.put("/api/m/:name/config", async (req, reply) => {
    const { name } = req.params as { name: string };
    const store = configStoreFor(name);
    if (!store) return reply.code(404).send({ error: "unknown module" });
    const body = req.body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return reply.code(400).send({ error: "body must be a config object" });
    }
    for (const [key, value] of Object.entries(body)) await store.set(key, value);
    return store.all();
  });

  if (opts.serveUi && existsSync(paths.uiDist)) {
    await app.register(fastifyStatic, { root: paths.uiDist });
    app.setNotFoundHandler((req, reply) => {
      // SPA fallback for non-API routes.
      if (req.url.startsWith("/api") || req.url.startsWith("/ws")) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  await app.listen({ port, host });
  log.info(`family-hub core listening on http://${host}:${port} (${loaded.length} modules)`);
}
