import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { defineModule, type PanelProps, type SettingsProps } from "@hub/sdk";
import { ScrollView, Title, useModuleHotkeys } from "@hub/components";
import { manifest } from "./manifest";
import {
  COMPLEXITY_LABEL,
  groceryTitle,
  mergeGroceries,
  type Complexity,
  type CommitResult,
  type Meal,
  type PlanResponse,
} from "./types";

const API = "/api/m/meal-prep";

/*
 * The week board is a sibling of the month calendar: same quiet cell treatment,
 * serif names, frosted modals. The one signature element is the complexity
 * marker — 1/2/3 small flames ("how long the fire burns"): fast weeknight,
 * regular, all-day project — tinted sage → copper → plum so a day reads from
 * across the room.
 */

const FLAME_TINT: Record<Complexity, string> = {
  fast: "#6f8a5c", // sage — quick fire
  regular: "#c2703d", // copper — the hearth default
  allday: "#8a5a78", // plum — slow and rich
};

const FLAME_COUNT: Record<Complexity, number> = { fast: 1, regular: 2, allday: 3 };

function Flames({ complexity, size = 11 }: { complexity: Complexity; size?: number }) {
  return (
    <span
      className="inline-flex items-center gap-px"
      title={`${COMPLEXITY_LABEL[complexity]} cooking`}
      style={{ color: FLAME_TINT[complexity] }}
    >
      {Array.from({ length: FLAME_COUNT[complexity] }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      ))}
    </span>
  );
}

// ── Local-date helpers ────────────────────────────────────────────────────────

function toDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function toYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(ymd: string, n: number): string {
  const d = toDate(ymd);
  d.setDate(d.getDate() + n);
  return toYmd(d);
}

const todayYmd = () => toYmd(new Date());

/** "Jun 29 – Jul 5" (year shown when the week isn't in the current year). */
function weekLabel(dates: string[]): string {
  const first = toDate(dates[0]!);
  const last = toDate(dates[dates.length - 1]!);
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
    });
  const withYear = last.getFullYear() !== new Date().getFullYear();
  return `${fmt(first, false)} – ${fmt(last, withYear)}`;
}

// ── Shared modal (same pattern as the calendar's; the shell's isn't importable) ─

function Modal({
  title,
  wide = false,
  onClose,
  children,
  footer,
}: {
  title: ReactNode;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-black/80" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={`panel relative z-[1] flex max-h-[85vh] flex-col overflow-hidden p-0 shadow-[0_40px_80px_rgba(0,0,0,0.6)] ${
          wide ? "w-[min(620px,96vw)]" : "w-[min(440px,96vw)]"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-base-content/10 bg-primary/[0.06] p-4">
          <div className="flex-1 font-sans text-sm font-semibold text-base-content">{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg border border-base-content/10 bg-base-content/5 text-base-content/60 hover:text-base-content"
          >
            ✕
          </button>
        </div>
        <ScrollView className="flex-1 p-4">{children}</ScrollView>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-base-content/10 p-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

const btnPrimary =
  "rounded-xl bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-content transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:hover:scale-100";
const btnQuiet =
  "rounded-xl border border-base-content/15 px-4 py-2 font-sans text-sm text-base-content/70 hover:bg-base-content/10 hover:text-base-content";
const inputCls =
  "w-full rounded-xl border border-base-content/15 bg-base-content/5 px-3 py-2 font-sans text-sm text-base-content outline-none placeholder:text-base-content/35 focus:border-primary/50";
const fieldLabel = "mb-1 block font-sans text-[11px] uppercase tracking-[0.08em] text-base-content/45";

// ── Markdown recipe body (no typography plugin — style the elements directly) ──

function Recipe({ markdown }: { markdown: string }) {
  return (
    <div className="font-sans text-sm leading-relaxed text-base-content/85">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h3 className="mb-2 mt-4 font-serif text-lg font-semibold text-base-content first:mt-0" {...p} />,
          h2: (p) => <h4 className="mb-1.5 mt-3 font-serif text-base font-semibold text-base-content first:mt-0" {...p} />,
          h3: (p) => <h5 className="mb-1 mt-3 font-sans text-sm font-semibold text-base-content first:mt-0" {...p} />,
          p: (p) => <p className="mb-2 last:mb-0" {...p} />,
          ul: (p) => <ul className="mb-2 list-disc space-y-1 pl-5" {...p} />,
          ol: (p) => <ol className="mb-2 list-decimal space-y-1 pl-5" {...p} />,
          li: (p) => <li className="marker:text-primary/70" {...p} />,
          strong: (p) => <strong className="font-semibold text-base-content" {...p} />,
          a: (p) => <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />,
          code: (p) => <code className="rounded bg-base-content/10 px-1 py-0.5 font-mono text-[12px]" {...p} />,
          blockquote: (p) => (
            <blockquote className="mb-2 border-l-2 border-primary/40 pl-3 font-serif italic text-base-content/70" {...p} />
          ),
          hr: () => <hr className="my-3 border-base-content/10" />,
          table: (p) => <table className="mb-2 w-full border-collapse text-[13px]" {...p} />,
          th: (p) => <th className="border-b border-base-content/20 py-1 pr-3 text-left font-semibold" {...p} />,
          td: (p) => <td className="border-b border-base-content/5 py-1 pr-3 align-top" {...p} />,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

// ── Meal form (create + edit share it) ───────────────────────────────────────

function MealForm({
  meal,
  onSaved,
  onDeleted,
  onClose,
}: {
  meal: Meal | null;
  onSaved: () => void;
  onDeleted?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(meal?.name ?? "");
  const [complexity, setComplexity] = useState<Complexity>(meal?.complexity ?? "regular");
  const [groceries, setGroceries] = useState((meal?.groceries ?? []).join("\n"));
  const [instructions, setInstructions] = useState(meal?.instructions ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(meal ? `${API}/meals/${meal.id}` : `${API}/meals`, {
        method: meal ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          complexity,
          instructions,
          groceries: groceries.split("\n").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const out = (await res.json()) as { ok: boolean; message?: string };
      if (!out.ok) throw new Error(out.message ?? "Couldn't save the meal.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (!meal) return;
    setBusy(true);
    try {
      await fetch(`${API}/meals/${meal.id}`, { method: "DELETE" });
      onDeleted?.();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={meal ? `Edit ${meal.name}` : "New meal"}
      wide
      onClose={onClose}
      footer={
        <>
          {meal && (
            <button onClick={remove} disabled={busy} className="mr-auto rounded-xl px-3 py-2 font-sans text-sm text-error/80 hover:bg-error/10">
              Delete meal
            </button>
          )}
          <button onClick={onClose} className={btnQuiet}>Cancel</button>
          <button onClick={save} disabled={busy || !name.trim()} className={btnPrimary}>
            {busy ? "Saving…" : meal ? "Save changes" : "Save meal"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className={fieldLabel} htmlFor="meal-name">Name</label>
          <input
            id="meal-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sheet-pan fajitas"
            className={inputCls}
            autoFocus
          />
        </div>

        <div>
          <span className={fieldLabel}>Cooking time</span>
          <div className="flex gap-2" role="radiogroup" aria-label="Cooking time">
            {(Object.keys(COMPLEXITY_LABEL) as Complexity[]).map((c) => {
              const active = complexity === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setComplexity(c)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-sans text-sm transition-colors ${
                    active
                      ? "border-primary/60 bg-primary/10 text-base-content"
                      : "border-base-content/15 text-base-content/60 hover:bg-base-content/5"
                  }`}
                >
                  <Flames complexity={c} />
                  {COMPLEXITY_LABEL[c]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className={fieldLabel} htmlFor="meal-groceries">Groceries — one per line</label>
          <textarea
            id="meal-groceries"
            value={groceries}
            onChange={(e) => setGroceries(e.target.value)}
            placeholder={"2 lbs chicken thighs\n3 bell peppers\ntortillas"}
            rows={5}
            spellCheck={false}
            className={`${inputCls} resize-y font-mono text-[13px]`}
          />
        </div>

        <div>
          <label className={fieldLabel} htmlFor="meal-instructions">Instructions — markdown</label>
          <textarea
            id="meal-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={"1. Slice peppers and onions\n2. Toss with spices …"}
            rows={8}
            spellCheck={false}
            className={`${inputCls} resize-y font-mono text-[13px]`}
          />
        </div>

        {error && <p className="font-sans text-sm text-error/80">{error}</p>}
      </div>
    </Modal>
  );
}

// ── Recipe view ───────────────────────────────────────────────────────────────

function RecipeModal({
  meal,
  onEdit,
  onClose,
}: {
  meal: Meal;
  onEdit: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      wide
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className="font-serif text-base">{meal.name}</span>
          <Flames complexity={meal.complexity} />
          <span className="font-sans text-[11px] font-normal text-base-content/45">
            {COMPLEXITY_LABEL[meal.complexity]}
          </span>
        </span>
      }
      footer={
        <button onClick={onEdit} className={btnQuiet}>Edit meal</button>
      }
    >
      {meal.groceries.length > 0 && (
        <div className="mb-4">
          <div className={fieldLabel}>Groceries</div>
          <ul className="flex flex-wrap gap-1.5">
            {meal.groceries.map((g, i) => (
              <li key={i} className="rounded-full bg-base-content/8 px-2.5 py-1 font-sans text-[12px] text-base-content/75">
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}
      {meal.instructions.trim() ? (
        <Recipe markdown={meal.instructions} />
      ) : (
        <p className="font-serif text-sm italic text-base-content/50">
          No instructions written yet — edit the meal to add some.
        </p>
      )}
    </Modal>
  );
}

// ── Meal library (browse / create / edit) ─────────────────────────────────────

function MealList({
  meals,
  emptyHint,
  onPick,
}: {
  meals: Meal[];
  emptyHint: string;
  onPick: (meal: Meal) => void;
}) {
  if (meals.length === 0) {
    return <p className="font-serif text-sm italic text-base-content/50">{emptyHint}</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {meals.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onPick(m)}
          className="flex items-center gap-3 rounded-xl border border-base-content/8 bg-base-content/[0.03] px-3 py-2 text-left transition-colors hover:border-base-content/25 hover:bg-base-content/[0.06]"
        >
          <span className="flex-1 truncate font-serif text-[15px] text-base-content">{m.name}</span>
          {m.groceries.length > 0 && (
            <span className="font-sans text-[11px] text-base-content/40">
              {m.groceries.length} item{m.groceries.length === 1 ? "" : "s"}
            </span>
          )}
          <Flames complexity={m.complexity} />
        </button>
      ))}
    </div>
  );
}

function LibraryModal({
  meals,
  onChanged,
  onClose,
}: {
  meals: Meal[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<Meal | null>(null);
  const [creating, setCreating] = useState(false);

  if (creating || editing) {
    return (
      <MealForm
        meal={editing}
        onSaved={() => {
          onChanged();
          setCreating(false);
          setEditing(null);
        }}
        onDeleted={() => {
          onChanged();
          setEditing(null);
        }}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <Modal
      title="Meal library"
      onClose={onClose}
      footer={
        <button onClick={() => setCreating(true)} className={btnPrimary}>
          New meal
        </button>
      }
    >
      <MealList
        meals={meals}
        emptyHint="No saved meals yet — create your first and it becomes plannable on any day."
        onPick={setEditing}
      />
    </Modal>
  );
}

// ── Add-meal-to-day picker ────────────────────────────────────────────────────

function DayPickerModal({
  date,
  meals,
  onPick,
  onCreate,
  onClose,
}: {
  date: string;
  meals: Meal[];
  onPick: (meal: Meal) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const label = toDate(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return (
    <Modal
      title={`Add a meal — ${label}`}
      onClose={onClose}
      footer={
        <button onClick={onCreate} className={btnQuiet}>
          New meal…
        </button>
      }
    >
      <MealList
        meals={meals}
        emptyHint="The library is empty — start with “New meal…” below."
        onPick={onPick}
      />
    </Modal>
  );
}

// ── Generate-groceries flow ───────────────────────────────────────────────────

interface GroceryEntry {
  text: string;
  count: number;
  included: boolean;
}

function GenerateModal({
  plan,
  onClose,
}: {
  plan: PlanResponse;
  onClose: () => void;
}) {
  const initial = useMemo(() => {
    const byId = new Map(plan.meals.map((m) => [m.id, m]));
    const lines = plan.dates
      .flatMap((d) => plan.days[d] ?? [])
      .map((id) => byId.get(id))
      .filter((m): m is Meal => m !== undefined)
      .flatMap((m) => m.groceries);
    return mergeGroceries(lines).map((e) => ({ ...e, included: true }));
  }, [plan]);

  const [entries, setEntries] = useState<GroceryEntry[]>(initial);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ list?: string; results: CommitResult[]; message?: string } | null>(null);

  const included = entries.filter((e) => e.included);

  function toggle(idx: number) {
    setEntries((es) => es.map((e, i) => (i === idx ? { ...e, included: !e.included } : e)));
  }

  function addExtra() {
    const text = extra.trim().replace(/\s+/g, " ");
    if (!text) return;
    setEntries((es) => [...es, { text, count: 1, included: true }]);
    setExtra("");
  }

  async function commit() {
    setBusy(true);
    try {
      const res = await fetch(`${API}/groceries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: included.map(groceryTitle) }),
      });
      const out = (await res.json()) as {
        ok: boolean;
        list?: string;
        results?: CommitResult[];
        message?: string;
      };
      setDone({
        ...(out.list ? { list: out.list } : {}),
        results: out.results ?? [],
        ...(out.message ? { message: out.message } : {}),
      });
    } catch (err) {
      setDone({ results: [], message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  // Post-commit: show what landed where (and anything that failed).
  if (done) {
    const failed = done.results.filter((r) => !r.ok);
    const added = done.results.length - failed.length;
    return (
      <Modal
        title="Grocery list"
        onClose={onClose}
        footer={<button onClick={onClose} className={btnPrimary}>Done</button>}
      >
        {added > 0 && (
          <p className="mb-2 font-sans text-sm text-base-content/85">
            Added {added} item{added === 1 ? "" : "s"} to{" "}
            <span className="font-semibold">{done.list ?? plan.groceryList}</span>.
          </p>
        )}
        {done.message && <p className="mb-2 font-sans text-sm text-error/80">{done.message}</p>}
        {failed.length > 0 && (
          <div className="mt-2">
            <div className={fieldLabel}>Didn't make it</div>
            <ul className="space-y-1">
              {failed.map((r, i) => (
                <li key={i} className="font-sans text-[13px] text-error/80">
                  {r.title} — {r.message ?? "failed"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      title={
        <span>
          Grocery list{" "}
          <span className="font-normal text-base-content/50">— week of {weekLabel(plan.dates)}</span>
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={btnQuiet}>Cancel</button>
          <button onClick={commit} disabled={busy || included.length === 0} className={btnPrimary}>
            {busy
              ? "Adding…"
              : `Add ${included.length} item${included.length === 1 ? "" : "s"} to ${plan.groceryList}`}
          </button>
        </>
      }
    >
      {entries.length === 0 ? (
        <p className="font-serif text-sm italic text-base-content/50">
          None of this week's meals have groceries on them yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {entries.map((e, i) => (
            <li key={`${e.text}-${i}`}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-base-content/5">
                <input
                  type="checkbox"
                  checked={e.included}
                  onChange={() => toggle(i)}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span
                  className={`flex-1 font-sans text-sm ${
                    e.included ? "text-base-content/90" : "text-base-content/35 line-through"
                  }`}
                >
                  {e.text}
                </span>
                {e.count > 1 && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 font-sans text-[11px] font-semibold text-primary">
                    ×{e.count}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <input
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addExtra()}
          placeholder="Add something else…"
          className={inputCls}
          aria-label="Add another grocery item"
        />
        <button onClick={addExtra} disabled={!extra.trim()} className={btnQuiet}>
          Add
        </button>
      </div>
    </Modal>
  );
}

// ── Week board ────────────────────────────────────────────────────────────────

function MealChip({
  meal,
  onOpen,
  onRemove,
}: {
  meal: Meal;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group/chip relative">
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-xl border border-base-content/8 bg-base-content/[0.04] px-2.5 py-2 text-left transition-colors hover:border-base-content/25 hover:bg-base-content/[0.07]"
      >
        <span className="block truncate pr-5 font-serif text-[clamp(13px,1.2vw,16px)] leading-snug text-base-content">
          {meal.name}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <Flames complexity={meal.complexity} size={10} />
          {meal.groceries.length > 0 && (
            <span className="font-sans text-[10px] text-base-content/35">
              {meal.groceries.length} item{meal.groceries.length === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${meal.name} from this day`}
        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-md text-base-content/35
                   opacity-0 transition-opacity hover:bg-base-content/10 hover:text-base-content/80
                   focus-visible:opacity-100 group-hover/chip:opacity-100"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

function DayColumn({
  date,
  meals,
  onAdd,
  onOpen,
  onRemove,
}: {
  date: string;
  meals: Meal[];
  onAdd: () => void;
  onOpen: (meal: Meal) => void;
  onRemove: (index: number) => void;
}) {
  const d = toDate(date);
  const isToday = date === todayYmd();
  return (
    <div
      className={`group/day flex min-h-0 flex-col overflow-hidden rounded-xl border px-1.5 py-1.5 ${
        isToday ? "border-primary/50 bg-primary/[0.07]" : "border-base-content/5 bg-base-content/[0.02]"
      }`}
    >
      <div className="mb-1.5 flex shrink-0 items-baseline justify-between px-1">
        <span
          className={`font-serif text-[clamp(11px,1.1vw,14px)] uppercase tracking-[0.08em] ${
            isToday ? "font-bold text-primary" : "text-base-content/45"
          }`}
        >
          {d.toLocaleDateString("en-US", { weekday: "short" })}
        </span>
        <span className={`font-sans text-[clamp(11px,1.1vw,13px)] ${isToday ? "font-bold text-primary" : "text-base-content/50"}`}>
          {d.getDate()}
        </span>
      </div>
      <ScrollView axis="y" className="flex min-h-0 flex-1 flex-col gap-1.5">
        {meals.map((m, i) => (
          <MealChip key={`${m.id}-${i}`} meal={m} onOpen={() => onOpen(m)} onRemove={() => onRemove(i)} />
        ))}
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add a meal to ${d.toLocaleDateString("en-US", { weekday: "long" })}`}
          className={`flex shrink-0 items-center justify-center gap-1 rounded-xl border border-dashed
                     border-base-content/15 py-1.5 font-sans text-[12px] text-base-content/40
                     transition-all hover:border-base-content/40 hover:text-base-content/70
                     focus-visible:opacity-100 ${
                       meals.length > 0 ? "opacity-0 group-hover/day:opacity-100 group-focus-within/day:opacity-100" : ""
                     }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          meal
        </button>
      </ScrollView>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function MealPrepPanel(_props: PanelProps) {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState(todayYmd);
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<Meal | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const planQuery = useQuery({
    queryKey: ["meal-prep", "plan", anchor],
    queryFn: async (): Promise<PlanResponse> => {
      const r = await fetch(`${API}/plan?anchor=${anchor}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<PlanResponse>;
    },
  });

  const plan = planQuery.data;
  const mealsById = useMemo(() => new Map((plan?.meals ?? []).map((m) => [m.id, m])), [plan]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["meal-prep"] });

  async function setDay(date: string, mealIds: string[]) {
    await fetch(`${API}/days/${date}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealIds }),
    });
    refresh();
  }

  const idsOn = (date: string) => plan?.days[date] ?? [];

  useModuleHotkeys({
    g: () => setGenerating(true),
    l: () => setLibraryOpen(true),
  });

  if (!plan) {
    return (
      <div className="grid h-full place-items-center">
        {planQuery.isError ? (
          <span className="font-serif text-sm italic text-base-content/60">Couldn't load the meal plan.</span>
        ) : (
          <span className="loading loading-spinner text-base-content/40" />
        )}
      </div>
    );
  }

  const isCurrentWeek = plan.dates.includes(todayYmd());
  const plannedCount = plan.dates.reduce((n, d) => n + (plan.days[d]?.length ?? 0), 0);
  const navBtn =
    "grid h-7 w-7 place-items-center rounded-lg text-lg leading-none text-base-content/45 hover:bg-base-content/10 hover:text-base-content/80";

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-1">
      <div className="flex shrink-0 items-center gap-3">
        <Title>Meals</Title>
        <div className="flex items-center gap-1">
          <button onClick={() => setAnchor((a) => addDays(a, -7))} aria-label="Previous week" className={navBtn}>
            ‹
          </button>
          <span className="min-w-[9ch] text-center font-serif text-[clamp(13px,1.4vw,17px)] text-base-content">
            {weekLabel(plan.dates)}
          </span>
          <button onClick={() => setAnchor((a) => addDays(a, 7))} aria-label="Next week" className={navBtn}>
            ›
          </button>
          {!isCurrentWeek && (
            <button
              onClick={() => setAnchor(todayYmd())}
              className="ml-1 rounded-lg px-2 py-1 font-sans text-[12px] text-base-content/50 hover:bg-base-content/10 hover:text-base-content/80"
            >
              This week
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setLibraryOpen(true)} className={btnQuiet}>
            Meal library
          </button>
          <button onClick={() => setGenerating(true)} disabled={plannedCount === 0} className={btnPrimary}>
            Generate grocery list
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 gap-2">
        {plan.dates.map((date) => (
          <DayColumn
            key={date}
            date={date}
            meals={idsOn(date).map((id) => mealsById.get(id)).filter((m): m is Meal => m !== undefined)}
            onAdd={() => setPickerDate(date)}
            onOpen={setViewing}
            onRemove={(index) => {
              const ids = idsOn(date);
              void setDay(date, [...ids.slice(0, index), ...ids.slice(index + 1)]);
            }}
          />
        ))}
      </div>

      {pickerDate && (
        <DayPickerModal
          date={pickerDate}
          meals={plan.meals}
          onPick={(meal) => {
            void setDay(pickerDate, [...idsOn(pickerDate), meal.id]);
            setPickerDate(null);
          }}
          onCreate={() => {
            setCreatingFor(pickerDate);
            setPickerDate(null);
          }}
          onClose={() => setPickerDate(null)}
        />
      )}

      {creatingFor && (
        <MealFormForDay
          date={creatingFor}
          onDone={(mealId) => {
            if (mealId) void setDay(creatingFor, [...idsOn(creatingFor), mealId]);
            else refresh();
            setCreatingFor(null);
          }}
          onClose={() => setCreatingFor(null)}
        />
      )}

      {viewing && (
        <RecipeModal
          meal={viewing}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
          onClose={() => setViewing(null)}
        />
      )}

      {editing && (
        <MealForm
          meal={editing}
          onSaved={() => {
            refresh();
            setEditing(null);
          }}
          onDeleted={() => {
            refresh();
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {libraryOpen && (
        <LibraryModal meals={plan.meals} onChanged={refresh} onClose={() => setLibraryOpen(false)} />
      )}

      {generating && <GenerateModal plan={plan} onClose={() => setGenerating(false)} />}
    </div>
  );
}

/** "New meal" launched from a day's picker: on save, also plan it onto that day. */
function MealFormForDay({
  date,
  onDone,
  onClose,
}: {
  date: string;
  onDone: (mealId: string | null) => void;
  onClose: () => void;
}) {
  // MealForm doesn't return the created meal, so fetch the library delta:
  // snapshot ids at mount, and after save pick the one new id.
  const [before] = useState<Promise<Set<string>>>(() =>
    fetch(`${API}/plan?anchor=${date}`)
      .then((r) => r.json() as Promise<PlanResponse>)
      .then((p) => new Set(p.meals.map((m) => m.id)))
      .catch(() => new Set<string>()),
  );

  return (
    <MealForm
      meal={null}
      onSaved={() => {
        void (async () => {
          try {
            const prior = await before;
            const now = (await (await fetch(`${API}/plan?anchor=${date}`)).json()) as PlanResponse;
            const created = now.meals.find((m) => !prior.has(m.id));
            onDone(created?.id ?? null);
          } catch {
            onDone(null);
          }
        })();
      }}
      onClose={onClose}
    />
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

const WEEKDAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

function MealPrepSettings({ onClose }: SettingsProps) {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState("sunday");
  const [groceryList, setGroceryList] = useState("Groceries");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API}/config`)
      .then((r) => r.json())
      .then((c: { weekStart?: string; groceryList?: string }) => {
        if (typeof c.weekStart === "string" && WEEKDAY_NAMES.includes(c.weekStart)) {
          setWeekStart(c.weekStart);
        }
        if (typeof c.groceryList === "string" && c.groceryList.trim()) {
          setGroceryList(c.groceryList);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function save() {
    setBusy(true);
    // Only the two settings keys — never write meals/days back through here.
    await fetch(`${API}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart, groceryList: groceryList.trim() || "Groceries" }),
    });
    void qc.invalidateQueries({ queryKey: ["meal-prep"] });
    onClose();
  }

  if (!loaded) {
    return (
      <div className="grid place-items-center py-8">
        <span className="loading loading-spinner text-base-content/40" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className={fieldLabel} htmlFor="mp-week-start">Week starts on</label>
        <select
          id="mp-week-start"
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
          className={inputCls}
        >
          {WEEKDAY_NAMES.map((d) => (
            <option key={d} value={d}>
              {d[0]!.toUpperCase() + d.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={fieldLabel} htmlFor="mp-grocery-list">Grocery list name</label>
        <input
          id="mp-grocery-list"
          value={groceryList}
          onChange={(e) => setGroceryList(e.target.value)}
          placeholder="Groceries"
          className={inputCls}
        />
        <p className="mt-1 font-sans text-[12px] text-base-content/45">
          The to-do list grocery commits go to — matched against your Google Tasks
          lists by name; falls back to the default list if none matches.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className={btnQuiet}>Cancel</button>
        <button onClick={save} disabled={busy} className={btnPrimary}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default defineModule({
  manifest,
  Panel: MealPrepPanel,
  Settings: MealPrepSettings,
});
