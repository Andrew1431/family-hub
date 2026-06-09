/**
 * Layout is config-driven, not drag-and-drop. The hub has one or more
 * **dashboards** — named, icon-tabbed views the user switches between. Each
 * dashboard is a responsive CSS grid holding **widget instances**: a placed
 * appearance of a module, identified by a unique `id` so its visual settings
 * are scoped to that instance (the same module can appear on several dashboards
 * with different settings). The user's `layout.local.json` is the source of
 * truth; modules supply only their preferred size via the manifest.
 */

/** Column/row span on the dashboard grid (12-column base). */
export interface GridSize {
  /** Columns spanned (1–12). */
  w: number;
  /** Rows spanned. */
  h: number;
}

export interface GridPlacement extends GridSize {
  /** 1-based column start. Omit to auto-flow. */
  col?: number;
  /** 1-based row start. Omit to auto-flow. */
  row?: number;
}

/**
 * One placed module on a dashboard. `id` is any unique string and scopes the
 * instance's visual settings; `module` names the module to render. Several
 * instances of the same module may coexist (across or within dashboards).
 */
export interface WidgetInstance extends GridPlacement {
  /** Unique instance id (any text). Scopes this widget's visual settings. */
  id: string;
  /** Module name to render (matches a manifest `name`). */
  module: string;
  /**
   * Instance-scoped visual settings (e.g. calendar view = "month", todo
   * layout = "tabs"). Shared/account data stays in the module's own stores;
   * only per-appearance presentation belongs here.
   */
  settings?: Record<string, unknown>;
}

/** A single switchable view: an icon-tabbed grid of widget instances. */
export interface DashboardConfig {
  /** Unique dashboard id. */
  id: string;
  /** Icon name for its tab in the header switcher (see UI icon set). */
  icon: string;
  /** Optional human label (used for the tab's accessible name). */
  label?: string;
  /** Per-dashboard column override; falls back to the top-level `columns`. */
  columns?: number;
  /** Per-dashboard row override; falls back to the top-level `rows`. */
  rows?: number;
  /** The widget instances placed on this dashboard. */
  widgets: WidgetInstance[];
}

/** Shape of `config/layout.local.json` (seeded from `layout.template.json`). */
export interface LayoutConfig {
  /** Default number of columns a dashboard grid is divided into. */
  columns: number;
  /**
   * Default number of equal-height rows to divide the viewport into. When set,
   * rows are `1fr` so panels fill the display (ideal for a fixed wall mirror).
   * When omitted, rows auto-size to content and the page scrolls if needed.
   */
  rows?: number;
  /** The dashboards, in tab order. The first is shown on load. */
  dashboards: DashboardConfig[];
}
