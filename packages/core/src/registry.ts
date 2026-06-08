import type {
  Capability,
  CapabilityRegistry,
  ContextContribution,
  ContextProvider,
  ModuleContext,
  AnthropicToolDef,
  McpToolDef,
} from "@hub/sdk";

interface Entry {
  module: string;
  cap: Capability;
  ctx: ModuleContext;
}

interface ContextEntry {
  module: string;
  provider: ContextProvider;
}

/**
 * The single shared registry. Every module's `ctx.capabilities` is a thin
 * facade over this; `list`/`invoke`/projections are global, while `register`
 * is bound to the calling module's name + context for routing.
 */
export class GlobalCapabilityRegistry {
  private entries = new Map<string, Entry>();
  private contextProviders: ContextEntry[] = [];

  private add(module: string, ctx: ModuleContext, cap: Capability): void {
    if (this.entries.has(cap.name)) {
      throw new Error(
        `Capability name collision: "${cap.name}" (module "${module}" vs "${this.entries.get(cap.name)!.module}")`,
      );
    }
    this.entries.set(cap.name, { module, cap, ctx });
  }

  private addContext(module: string, provider: ContextProvider): void {
    this.contextProviders.push({ module, provider });
  }

  /** Run every context provider in parallel; drop failures and empties so one
   *  broken provider never breaks a chat. */
  async collectContext(): Promise<ContextContribution[]> {
    const results = await Promise.all(
      this.contextProviders.map(async ({ module, provider }) => {
        try {
          const text = (await provider())?.trim();
          return text ? { source: module, text } : null;
        } catch {
          return null;
        }
      }),
    );
    return results.filter((c): c is ContextContribution => c !== null);
  }

  list(): Capability[] {
    return [...this.entries.values()].map((e) => e.cap);
  }

  async invoke(name: string, input: Record<string, unknown>): Promise<unknown> {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`Unknown capability: "${name}"`);
    return entry.cap.handler(input, entry.ctx);
  }

  toAnthropicTools(): AnthropicToolDef[] {
    return this.list().map((c) => ({
      name: c.name,
      description: c.description,
      input_schema: c.inputSchema,
    }));
  }

  toMcpTools(): McpToolDef[] {
    return this.list().map((c) => ({
      name: c.name,
      description: c.description,
      inputSchema: c.inputSchema,
    }));
  }

  /** Build the per-module facade exposed as `ctx.capabilities`. */
  facadeFor(module: string, getCtx: () => ModuleContext): CapabilityRegistry {
    return {
      register: (cap) => this.add(module, getCtx(), cap as Capability),
      list: () => this.list(),
      invoke: (name, input) => this.invoke(name, input),
      registerContext: (provider) => this.addContext(module, provider),
      collectContext: () => this.collectContext(),
      toAnthropicTools: () => this.toAnthropicTools(),
      toMcpTools: () => this.toMcpTools(),
    };
  }
}
