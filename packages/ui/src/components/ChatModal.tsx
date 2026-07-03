import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "@hub/components";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

// Compact markdown styling tuned for small chat bubbles on the warm theme.
// Kept here (not @tailwindcss/typography) so colors inherit the bubble instead
// of fighting `prose`.
const MD_COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded bg-base-content/10 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-base-content/10 p-2.5 font-mono text-[0.85em] last:mb-0">
      {children}
    </pre>
  ),
  h1: ({ children }) => <h1 className="mb-1.5 text-[1.1em] font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1.5 text-[1.05em] font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 font-semibold">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-primary/40 pl-2.5 italic opacity-90 last:mb-0">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="border-collapse text-[0.9em]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-base-content/15 px-2 py-1 text-left">{children}</th>,
  td: ({ children }) => <td className="border border-base-content/15 px-2 py-1">{children}</td>,
};

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hey there! I'm your family assistant — I know your schedule, to-dos, and the weather. Ask me anything, or tell me what you need. 🏡",
};

const SUGGESTIONS = [
  "What's on the schedule today?",
  "Add 'call the plumber' to the to-do list",
  "What's the weather looking like?",
  "What tasks are still pending?",
];

function OrbBadge({ size = "lg" }: { size?: "sm" | "lg" }) {
  const cls =
    size === "lg"
      ? "h-9 w-9 shadow-[0_0_16px_color-mix(in_oklab,var(--color-primary)_40%,transparent)]"
      : "h-6 w-6 text-[11px]";
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-warning text-primary-content ${cls}`}
      aria-hidden
    >
      ✦
    </div>
  );
}

export function ChatModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: msg }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/m/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      const reply = data.reply ?? data.message ?? "Sorry, I couldn't get a response.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      // The assistant changed home state (added a to-do, created an event, …);
      // refetch every panel so the dashboard reflects it without the 5-min wait.
      if (data.mutated) void qc.invalidateQueries();
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Hmm, something went wrong. Try again in a moment!" },
      ]);
    }
    setLoading(false);
  };

  return (
    <Modal
      title="Family Assistant"
      subtitle="Knows your schedule, tasks & weather"
      icon={<OrbBadge />}
      onClose={onClose}
      align="bottom"
      width="min(640px, 96vw)"
      height="min(580px, 70vh)"
      bodyClassName="flex flex-col gap-3"
      footer={
        <div className="flex flex-col gap-2.5">
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] text-primary
                             transition-colors hover:bg-primary/20"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask about your schedule, add to-dos, get ideas…"
              rows={1}
              className="max-h-[100px] flex-1 resize-none rounded-2xl border border-base-content/15 bg-base-content/5 px-3.5 py-2.5 text-[13px] text-base-content outline-none"
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-warning text-lg text-primary-content disabled:opacity-40"
            >
              ↑
            </button>
          </div>
        </div>
      }
    >
      {messages.map((m, i) => (
        <div
          key={i}
          className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
        >
          {m.role === "assistant" && <OrbBadge size="sm" />}
          <div
            className={`max-w-[80%] px-3.5 py-2.5 text-[13px] leading-relaxed ${
              m.role === "user"
                ? "whitespace-pre-wrap rounded-[18px_18px_4px_18px] bg-primary text-primary-content"
                : "rounded-[18px_18px_18px_4px] border border-base-content/10 bg-base-content/5 text-base-content"
            }`}
          >
            {m.role === "assistant" ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {m.content}
              </ReactMarkdown>
            ) : (
              m.content
            )}
          </div>
        </div>
      ))}
      {loading && (
        <div className="flex items-end gap-2">
          <OrbBadge size="sm" />
          <div className="rounded-[18px_18px_18px_4px] border border-base-content/10 bg-base-content/5 px-4 py-2.5">
            <span className="loading loading-dots loading-sm text-primary" />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </Modal>
  );
}
