import type { JSONSchema } from "./json-schema.js";
import type { ModuleContext } from "./context.js";

/**
 * A Capability is the single primitive that powers the AI system.
 *
 * Modules register capabilities into the core registry. From that one
 * registry the core projects:
 *   - Anthropic tool-use definitions  (assistant talks to Claude)
 *   - MCP tool definitions            (mirror published as an MCP server)
 *
 * Because the Anthropic and MCP tool shapes are identical
 * ({ name, description, input schema }), a capability is defined once and
 * works in both worlds. The assistant module needs zero knowledge of any
 * specific module — adding a module that registers capabilities instantly
 * extends what the assistant can do.
 */
export interface Capability<I = Record<string, unknown>, O = unknown> {
  /** Unique, snake_case, tool-safe. Convention: `<module>_<verb>`, e.g. `calendar_add_event`. */
  name: string;
  /** Plain-language description the model uses to decide when to call it. */
  description: string;
  /** JSON Schema for the input object. */
  inputSchema: JSONSchema;
  /** Executes the capability. `ctx` is the owning module's context. */
  handler: (input: I, ctx: ModuleContext) => Promise<O> | O;
  /** Hints for the core / UI about how to treat invocations. */
  annotations?: CapabilityAnnotations;
}

export interface CapabilityAnnotations {
  /** Does not mutate state; safe to call speculatively. */
  readOnly?: boolean;
  /** UI should ask a human before this runs (e.g. sending money, deleting). */
  requiresConfirmation?: boolean;
}

/**
 * Ambient context: a module can register a provider whose text is injected into
 * the assistant's system prompt on every chat. Use it for small, always-useful
 * facts the model should know without spending a tool call — e.g. which to-do
 * lists exist (and their IDs), the home location, the local timezone. Keep it
 * compact; this rides on every request. Return `undefined`/empty to contribute
 * nothing (e.g. before any account is connected). Run on each chat, so it can
 * read live state, but prefer cheap reads (config, not network) where possible.
 */
export type ContextProvider = () => Promise<string | undefined> | string | undefined;

/** A provider's resolved, non-empty contribution, tagged with its module. */
export interface ContextContribution {
  source: string;
  text: string;
}

/** Anthropic Messages API tool definition. */
export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: JSONSchema;
}

/** MCP tool definition. */
export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

/**
 * The shared registry. Lives in core as a single injected service; each
 * module receives it via its ModuleContext (`ctx.capabilities`).
 */
export interface CapabilityRegistry {
  /** Register a capability. The owning module's name is bound automatically. */
  register<I, O>(cap: Capability<I, O>): void;
  /** All registered capabilities across every module. */
  list(): Capability[];
  /** Invoke by name; routes to the owning module's handler + context. */
  invoke(name: string, input: Record<string, unknown>): Promise<unknown>;
  /** Register an ambient-context provider; its text rides on every assistant chat. */
  registerContext(provider: ContextProvider): void;
  /** Run every provider (in parallel); returns the non-empty contributions. */
  collectContext(): Promise<ContextContribution[]>;
  /** Project the registry into Anthropic tool-use definitions. */
  toAnthropicTools(): AnthropicToolDef[];
  /** Project the registry into MCP tool definitions. */
  toMcpTools(): McpToolDef[];
}
