#!/usr/bin/env node
// Seeds user-tweakable local config from committed templates.
// Local files (config/*.local.*) are gitignored, so each install can be
// customized without producing commit noise. Idempotent: never overwrites.
import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const configDir = resolve(root, "config");
const modulesDir = resolve(root, "modules");

let created = 0;

/** Copy template → local if the local doesn't exist yet. */
function seed(src, dest) {
  if (!existsSync(src)) return;
  if (existsSync(dest)) {
    console.log(`[seed] keeping existing ${relative(root, dest)}`);
    return;
  }
  copyFileSync(src, dest);
  console.log(`[seed] created ${relative(root, dest)} from ${relative(root, src)}`);
  created++;
}

// Global config (theme, layout, hub settings).
for (const [template, local] of [
  ["theme.template.css", "theme.local.css"],
  ["layout.template.json", "layout.local.json"],
  ["hub.template.json", "hub.local.json"],
]) {
  seed(resolve(configDir, template), resolve(configDir, local));
}

// Per-module config: each module owns its own config.template.json.
if (existsSync(modulesDir)) {
  for (const name of readdirSync(modulesDir)) {
    const dir = join(modulesDir, name);
    if (!statSync(dir).isDirectory()) continue;
    seed(join(dir, "config.template.json"), join(dir, "config.local.json"));
  }
}

console.log(`[seed] done (${created} file(s) created)`);
