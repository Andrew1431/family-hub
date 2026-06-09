# Family Hub — marketing site

Static, dependency-free landing page (`index.html` + `styles.css` + `images/`).
No build step — it serves as-is from GitHub Pages.

## Local preview

Open `docs/index.html` in a browser, or serve the folder:

```bash
npx serve docs        # or: python -m http.server -d docs 8080
```

## Publish on GitHub Pages

1. Make the repo public (currently private).
2. Repo **Settings → Pages → Build and deployment**:
   - **Source:** Deploy from a branch
   - **Branch:** `main` · **Folder:** `/docs`
3. Save. The site goes live at `https://<user>.github.io/<repo>/`.

`.nojekyll` is present so Pages serves the files untouched.

## Images

Every section uses a themed **placeholder SVG** in `images/`. Swap in real
screenshots by overwriting the matching file (keep the filename, or update the
`src` in `index.html`):

| File | Section |
|---|---|
| `hero-dashboard.svg` | Hero |
| `ai-assistant.svg` | AI-driven management |
| `custom-views.svg` | Customizable dashboards |
| `feature-weather.svg` / `feature-calendar.svg` / `feature-tasks.svg` | Shipped features |
| `interactive.svg` | Interactive hub |
| `theming.svg` | Themeable design |

## Notes

- Colors mirror `config/theme.template.css` (the "hearth" dashboard theme).
- The "View on GitHub" / "Get started" buttons link to `#` — point them at the
  real repo URL once it's public.
