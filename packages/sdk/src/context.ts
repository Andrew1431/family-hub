import type { CapabilityRegistry } from "./capabilities.js";

/**
 * Dependency-injection surface handed to every module backend at mount time.
 * Modules never import core internals directly — they receive this context,
 * keeping them decoupled and individually testable.
 */
export interface ModuleContext {
  /** This module's unique name (matches its manifest + URL prefix). */
  readonly name: string;
  /** Structured logger, namespaced to the module. */
  readonly log: Logger;
  /** Per-module persisted key/value config (non-secret). */
  readonly config: KVStore;
  /** Per-module secret store (API keys, OAuth tokens) — never sent to the UI. */
  readonly secrets: KVStore;
  /** Real-time pub/sub bridged to the frontend over WebSocket. */
  readonly bus: EventBus;
  /** Shared capability registry — register tools here to expose them to the AI. */
  readonly capabilities: CapabilityRegistry;
  /** Register HTTP routes under this module's scoped prefix (`/api/m/<name>`). */
  route: RouteRegistrar;
}

export interface Logger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

export interface KVStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  all<T = unknown>(): Promise<Record<string, T>>;
}

export interface EventBus {
  /** Publish an event to all subscribed frontends. Topic is auto-namespaced. */
  publish<T = unknown>(topic: string, payload: T): void;
  /** Subscribe to events published by frontends or other modules. */
  subscribe<T = unknown>(topic: string, handler: (payload: T) => void): () => void;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteHandlerArgs {
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: unknown;
}

export type RouteRegistrar = (
  method: HttpMethod,
  path: string,
  handler: (args: RouteHandlerArgs) => Promise<unknown> | unknown,
) => void;
