import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { defineModule, type PanelProps } from "@hub/sdk";
import { ScrollView } from "@hub/components";
import { manifest } from "./manifest";

/*
 * Notes — deliberately dumb. No accounts, no sync, no backend. The whole ordered
 * list lives under one `notes` config key and is read/written through the core's
 * generic /config endpoint (same path the pregnancy card uses). Each card is a
 * big-type sticky meant to be read across the room, so type is larger than the
 * rest of the app and the per-card colour drives a black/white text choice by
 * contrast.
 */

const API = "/api/m/notes";

interface Note {
  id: string;
  text: string;
  color: string;
}

// Warm "hearth" presets — copper/terracotta/amber through sage, teal, plum and a
// couple of light/dark anchors. The custom swatch lets you pick anything else.
const PRESETS = [
  "#c2703d", // copper
  "#c0492f", // terracotta
  "#d99a2b", // amber
  "#6f8a5c", // sage
  "#3f7d78", // teal
  "#4f6184", // slate blue
  "#8a5a78", // plum
  "#b56a86", // rose
  "#efe3c8", // cream
  "#332b27", // espresso
];

// Near-black / near-white kept slightly warm so text doesn't feel clinical.
const INK_DARK = "#221a14";
const INK_LIGHT = "#fbf6ee";

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a #rrggbb colour (0 = black … 1 = white). */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return 0;
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((h) => parseInt(h, 16));
  return 0.2126 * srgbToLinear(r!) + 0.7152 * srgbToLinear(g!) + 0.0722 * srgbToLinear(b!);
}

/** Pick whichever ink contrasts more with the background (WCAG contrast ratio). */
function inkFor(bg: string): string {
  const L = luminance(bg);
  const withLight = (1.0 + 0.05) / (L + 0.05);
  const withDark = (L + 0.05) / (0.0 + 0.05);
  return withDark >= withLight ? INK_DARK : INK_LIGHT;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// ── Single note card ──────────────────────────────────────────────────────────

function NoteCard({
  note,
  onChangeText,
  onCommit,
  onSetColor,
  onDelete,
}: {
  note: Note;
  onChangeText: (text: string) => void;
  onCommit: () => void;
  onSetColor: (color: string) => void;
  onDelete: () => void;
}) {
  const ink = inkFor(note.color);
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div
      className="group/note relative flex h-full w-[clamp(240px,21vw,340px)] shrink-0 flex-col
                 overflow-hidden rounded-2xl shadow-lg"
      style={{ backgroundColor: note.color, color: ink }}
    >
      {/* Delete — top-right X, subtle until you hover the card. */}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete note"
        className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full
                   opacity-0 transition-opacity duration-150 hover:bg-black/10
                   focus-visible:opacity-100 group-hover/note:opacity-100"
        style={{ color: ink }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {/* The note text — large, the whole point of the card. */}
      <textarea
        value={note.text}
        onChange={(e) => onChangeText(e.target.value)}
        onBlur={onCommit}
        placeholder="Write a note…"
        spellCheck={false}
        className="flex-1 resize-none bg-transparent px-5 pb-2 pt-12 font-serif
                   text-[clamp(20px,2.1vw,30px)] leading-snug outline-none
                   placeholder:opacity-40"
        style={{ color: ink, caretColor: ink }}
        aria-label="Note text"
      />

      {/* Colour controls — revealed on hover/focus so they don't clutter from a distance. */}
      <div
        className="flex items-center gap-1.5 px-4 pb-3 pt-1 opacity-0 transition-opacity duration-150
                   focus-within:opacity-100 group-hover/note:opacity-100"
      >
        {paletteOpen ? (
          <>
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onSetColor(c);
                  setPaletteOpen(false);
                }}
                aria-label={`Use colour ${c}`}
                className="h-5 w-5 shrink-0 rounded-full ring-1 ring-black/15"
                style={{ backgroundColor: c }}
              />
            ))}
            <label
              className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-full ring-1 ring-black/15"
              style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}
              aria-label="Custom colour"
            >
              <input
                type="color"
                value={note.color}
                onChange={(e) => onSetColor(e.target.value)}
                className="h-0 w-0 opacity-0"
              />
            </label>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Change colour"
            className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs hover:bg-black/10"
            style={{ color: ink }}
          >
            <span className="inline-block h-3.5 w-3.5 rounded-full ring-1 ring-black/20" style={{ backgroundColor: note.color }} />
            Colour
          </button>
        )}
      </div>
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────

const NOTES_KEY = ["notes", "items"] as const;

function NotesPanel(_props: PanelProps) {
  const query = useQuery({
    queryKey: NOTES_KEY,
    queryFn: async (): Promise<Note[]> => {
      const res = await fetch(`${API}/config`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { notes?: Note[] };
      return Array.isArray(data.notes) ? data.notes : [];
    },
  });

  // Local list is the editing surface; the query only seeds it once. Persisting
  // the whole array on every change keeps the wire format trivially simple.
  const [notes, setNotes] = useState<Note[] | null>(null);
  useEffect(() => {
    if (query.data && notes === null) setNotes(query.data);
  }, [query.data, notes]);

  const scrollRef = useRef<HTMLDivElement>(null);

  function persist(next: Note[]) {
    void fetch(`${API}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: next }),
    });
  }

  function update(next: Note[], save = true) {
    setNotes(next);
    if (save) persist(next);
  }

  function addNote() {
    const list = notes ?? [];
    const color = PRESETS[list.length % PRESETS.length]!;
    const note: Note = { id: newId(), text: "", color };
    update([...list, note]);
    // Scroll the new card into view and focus it after it mounts.
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollLeft = el.scrollWidth;
      const areas = el?.querySelectorAll("textarea");
      areas?.[areas.length - 1]?.focus();
    });
  }

  if (notes === null) {
    return (
      <div className="grid h-full place-items-center">
        {query.isError ? (
          <span className="font-serif text-sm italic text-base-content/60">Couldn't load notes.</span>
        ) : (
          <span className="loading loading-spinner text-base-content/40" />
        )}
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <span className="panel-label mb-2 shrink-0">Notes</span>

      {notes.length === 0 ? (
        <button
          type="button"
          onClick={addNote}
          className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed
                     border-base-content/20 text-base-content/50 transition-colors hover:border-base-content/40 hover:text-base-content/70"
        >
          <PlusCircle />
          <span className="font-serif text-sm italic">Add your first note</span>
        </button>
      ) : (
        <ScrollView ref={scrollRef} axis="x" className="flex flex-1 gap-4 pb-1 pr-16">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onChangeText={(text) =>
                update(notes.map((n) => (n.id === note.id ? { ...n, text } : n)), false)
              }
              onCommit={() => persist(notes)}
              onSetColor={(color) =>
                update(notes.map((n) => (n.id === note.id ? { ...n, color } : n)))
              }
              onDelete={() => update(notes.filter((n) => n.id !== note.id))}
            />
          ))}
        </ScrollView>
      )}

      {/* Circular add button, anchored to the bottom of the notes. */}
      {notes.length > 0 && (
        <button
          type="button"
          onClick={addNote}
          aria-label="Add note"
          className="absolute bottom-2 right-2 grid h-14 w-14 place-items-center rounded-full
                     bg-primary text-primary-content shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}
    </div>
  );
}

function PlusCircle() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export default defineModule({ manifest, Panel: NotesPanel });
