import Anthropic from "@anthropic-ai/sdk";
import { defineBackend } from "@hub/sdk";

const SYSTEM_BASE = `You are a warm, concise family assistant living on a smart-mirror dashboard in the family's home.

Use your tools rather than guessing:
- To answer a question, call the relevant read-only tool first — never invent schedule, task, or weather details.
- To change something, call the matching tool, then confirm cheerfully in one sentence.
- If no tool covers what's asked, say so briefly instead of pretending.

Keep replies short, friendly, and glanceable — this is a wall display, not a chat app. Respond only with your final answer; do not narrate your reasoning or describe which tools you're using.`;

/**
 * The full tool schemas are already sent in the `tools` array; this just gives
 * the model a quick at-a-glance index of what's wired up right now, built from
 * the live registry so it never goes stale as modules are added or removed.
 */
function buildSystem(caps: { name: string; description: string }[]): string {
  if (caps.length === 0) {
    return `${SYSTEM_BASE}\n\nYou currently have no tools available, so you can only chat — let the family know if they ask for something that needs one.`;
  }
  const list = caps.map((c) => `- ${c.name}: ${c.description}`).join("\n");
  return `${SYSTEM_BASE}\n\nTools available right now:\n${list}`;
}

// Sonnet 4.6 at low effort is plenty for glanceable family-hub replies and far
// cheaper than Opus. Both are overridable via ctx.config ("model" / "effort").
// Note: `effort` 400s on Haiku, so it's omitted automatically for haiku models.
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_EFFORT = "low";
const MAX_TOOL_TURNS = 8;

type Effort = "low" | "medium" | "high" | "max";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export default defineBackend((ctx) => {
  ctx.route("POST", "/chat", async ({ body }) => {
    const apiKey = (await ctx.secrets.get<string>("apiKey")) ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        error: "no_api_key",
        message: "Add your Claude API key in settings to enable the assistant.",
      };
    }

    // Drop any leading assistant turns (e.g. the UI's greeting) — the API
    // requires the first message to be from the user.
    const incoming = ((body as { messages?: ChatTurn[] } | undefined)?.messages ?? []).slice();
    const firstUser = incoming.findIndex((m) => m.role === "user");
    const turns = firstUser >= 0 ? incoming.slice(firstUser) : [];
    if (turns.length === 0) {
      return { reply: "Hi! Ask me about your schedule, to-dos, or the weather." };
    }

    const model = (await ctx.config.get<string>("model")) ?? DEFAULT_MODEL;
    const effort = (await ctx.config.get<Effort>("effort")) ?? DEFAULT_EFFORT;
    const client = new Anthropic({ apiKey });
    const tools = ctx.capabilities.toAnthropicTools() as Anthropic.Tool[];
    const system = buildSystem(tools.map((t) => ({ name: t.name, description: t.description ?? "" })));
    const messages: Anthropic.MessageParam[] = turns.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const res = await client.messages.create({
        model,
        max_tokens: 1024,
        system,
        tools,
        messages,
        thinking: { type: "disabled" },
        // effort is unsupported on Haiku; keep it off there to avoid a 400.
        ...(model.includes("haiku") ? {} : { output_config: { effort } }),
      });
      messages.push({ role: "assistant", content: res.content });

      if (res.stop_reason !== "tool_use") {
        const reply = res.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        return { reply: reply || "…" };
      }

      // Execute every requested tool against the shared registry; each routes
      // to the module that registered it.
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        try {
          const out = await ctx.capabilities.invoke(
            block.name,
            block.input as Record<string, unknown>,
          );
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(out),
          });
        } catch (err) {
          ctx.log.warn(`tool ${block.name} failed`, err);
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: ${String(err)}`,
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: results });
    }

    return { reply: "Sorry, I got a bit tangled up on that one — try rephrasing?" };
  });

  ctx.log.info("assistant ready");
});
