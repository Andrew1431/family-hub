import { readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { FastifyInstance } from "fastify";
import type { ModuleManifest, ModuleBackend, RouteRegistrar, RouteHandlerArgs } from "@hub/sdk";
import type { Db } from "./db.js";
import type { GlobalCapabilityRegistry } from "./registry.js";
import type { GlobalEventBus } from "./bus.js";
import { buildContext } from "./context.js";
import { makeLogger } from "./logger.js";

const log = makeLogger("loader");

export interface LoadedModule {
  manifest: ModuleManifest;
  dir: string;
  /** Merged committed+local config defaults; the server builds a store from this
   *  to serve and persist settings written by a module's settings UI. */
  configDefaults: Record<string, unknown>;
}

export interface LoaderDeps {
  app: FastifyInstance;
  db: Db;
  registry: GlobalCapabilityRegistry;
  bus: GlobalEventBus;
  modulesDir: string;
}

/** First file that exists for the given basename + supported extensions. */
function entryFile(dir: string, base: string): string | undefined {
  for (const ext of [".ts", ".tsx", ".js", ".mjs"]) {
    const p = join(dir, base + ext);
    if (existsSync(p)) return p;
  }
  return undefined;
}

/** Merge a module's committed defaults with the user's gitignored overrides. */
function readModuleConfig(dir: string): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const file of ["config.template.json", "config.local.json"]) {
    const p = join(dir, file);
    if (!existsSync(p)) continue;
    try {
      Object.assign(merged, JSON.parse(readFileSync(p, "utf8")));
    } catch (err) {
      log.warn(`bad config in ${file} for "${dir}"`, err);
    }
  }
  delete merged["$comment"];
  return merged;
}

/** Warn (never throw) about missing required secrets/config on a loaded module. */
async function checkRequirements(ctx: {
  name: string;
  secrets: { get(k: string): Promise<unknown> };
  config: { get(k: string): Promise<unknown> };
}, manifest: ModuleManifest): Promise<void> {
  const req = manifest.requires;
  if (!req) return;
  for (const key of req.secrets ?? []) {
    if ((await ctx.secrets.get(key)) === undefined) {
      log.warn(`module "${manifest.name}" is missing required secret "${key}" — it will run degraded`);
    }
  }
  for (const key of req.config ?? []) {
    if ((await ctx.config.get(key)) === undefined) {
      log.warn(`module "${manifest.name}" is missing required config "${key}"`);
    }
  }
}

/**
 * Scan `modulesDir`, and for each module: read its manifest, then (if it has a
 * backend) register a Fastify plugin scoped to `/api/m/<name>`, build the
 * module's injected context, and run its backend setup.
 */
export async function loadModules(deps: LoaderDeps): Promise<LoadedModule[]> {
  const { app, db, registry, bus, modulesDir } = deps;
  if (!existsSync(modulesDir)) {
    log.warn(`modules directory not found: ${modulesDir}`);
    return [];
  }

  const loaded: LoadedModule[] = [];
  const dirs = readdirSync(modulesDir).filter((d) =>
    statSync(join(modulesDir, d)).isDirectory(),
  );

  for (const name of dirs) {
    const dir = join(modulesDir, name);
    const manifestFile = entryFile(dir, "manifest");
    if (!manifestFile) {
      log.warn(`skipping "${name}": no manifest`);
      continue;
    }

    const manifestMod = await import(pathToFileURL(manifestFile).href);
    const manifest = (manifestMod.manifest ?? manifestMod.default) as ModuleManifest | undefined;
    if (!manifest?.name) {
      log.warn(`skipping "${name}": manifest has no name`);
      continue;
    }
    if (manifest.name !== name) {
      log.warn(`module "${name}" declares mismatched manifest name "${manifest.name}"`);
    }

    const configDefaults = readModuleConfig(dir);

    if (manifest.hasBackend) {
      const backendFile = entryFile(dir, "backend");
      if (!backendFile) {
        log.warn(`module "${name}" sets hasBackend but no backend file found`);
      } else {
        await app.register(
          async (scope) => {
            const route: RouteRegistrar = (method, path, handler) => {
              scope.route({
                method,
                url: path.startsWith("/") ? path : `/${path}`,
                handler: async (req) =>
                  handler({
                    params: req.params as RouteHandlerArgs["params"],
                    query: req.query as RouteHandlerArgs["query"],
                    body: req.body,
                  }),
              });
            };
            const ctx = buildContext(manifest.name, {
              db,
              registry,
              bus,
              route,
              configDefaults,
              secretEnv: manifest.secretEnv ?? {},
            });
            const backendMod = await import(pathToFileURL(backendFile).href);
            const setup = (backendMod.default ?? backendMod.backend) as ModuleBackend | undefined;
            if (typeof setup !== "function") {
              log.warn(`module "${name}" backend has no default export function`);
              return;
            }
            await setup(ctx);
            await checkRequirements(ctx, manifest);
            log.info(`mounted backend at /api/m/${manifest.name}`);
          },
          { prefix: `/api/m/${manifest.name}` },
        );
      }
    }

    loaded.push({ manifest, dir, configDefaults });
    log.info(`loaded module "${manifest.name}" v${manifest.version}`);
  }

  return loaded;
}
