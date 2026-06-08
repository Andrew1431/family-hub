/**
 * Layout is config-driven, not drag-and-drop. A single responsive CSS grid
 * places module panels by name. Each module declares a preferred size in its
 * manifest; the user's `layout.local.json` overrides placement.
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

/** Shape of `config/layout.local.json` (seeded from `layout.template.json`). */
export interface LayoutConfig {
  /** Number of columns the grid is divided into. */
  columns: number;
  /**
   * Number of equal-height rows to divide the viewport into. When set, rows are
   * `1fr` so panels fill the display (ideal for a fixed wall mirror). When
   * omitted, rows auto-size to content and the page scrolls if needed.
   */
  rows?: number;
  /** Module name → placement. Modules absent here use their manifest default. */
  panels: Record<string, GridPlacement>;
  /** Render order for panels sharing auto-flow; lower comes first. */
  order?: string[];
}
