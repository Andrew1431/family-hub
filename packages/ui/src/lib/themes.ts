/**
 * Runtime theme discovery. daisyUI emits one `[data-theme="name"]` rule per
 * theme block in config/theme.local.css, so the list of installed themes can
 * be read straight out of the loaded stylesheets — drop a new theme block in
 * the CSS and it shows up in the Settings picker with no code change.
 */

export interface ThemeInfo {
  name: string;
  /** From the theme's own `color-scheme` declaration. */
  scheme: "light" | "dark";
  /** Swatch colors probed from the live theme, for the picker preview. */
  swatch: {
    base: string;
    panel: string;
    text: string;
    primary: string;
    accent: string;
  };
}

const THEME_SELECTOR = /\[data-theme=(?:"|')?([\w-]+)(?:"|')?\]/g;

function collectNames(rules: CSSRuleList, into: Set<string>): void {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      for (const m of rule.selectorText.matchAll(THEME_SELECTOR)) {
        if (m[1]) into.add(m[1]);
      }
    } else if (rule instanceof CSSGroupingRule) {
      collectNames(rule.cssRules, into);
    }
  }
}

/**
 * Probe each discovered theme by mounting a hidden element with that
 * `data-theme` and reading its computed tokens.
 */
export function discoverThemes(): ThemeInfo[] {
  const names = new Set<string>();
  for (const sheet of document.styleSheets) {
    try {
      collectNames(sheet.cssRules, names);
    } catch {
      // Cross-origin sheet (shouldn't happen — everything is bundled) — skip.
    }
  }

  const probe = document.createElement("div");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const themes: ThemeInfo[] = [];
  try {
    for (const name of names) {
      probe.setAttribute("data-theme", name);
      const cs = getComputedStyle(probe);
      const v = (token: string) => cs.getPropertyValue(token).trim();
      const base = v("--color-base-100");
      if (!base) continue; // selector matched but not a real daisyUI theme
      themes.push({
        name,
        scheme: cs.colorScheme.includes("dark") ? "dark" : "light",
        swatch: {
          base,
          panel: v("--color-base-200"),
          text: v("--color-base-content"),
          primary: v("--color-primary"),
          accent: v("--color-accent"),
        },
      });
    }
  } finally {
    probe.remove();
  }
  // Stable, human-friendly order: dark first (the default family), then name.
  return themes.sort((a, b) =>
    a.scheme === b.scheme ? a.name.localeCompare(b.name) : a.scheme === "dark" ? -1 : 1,
  );
}
