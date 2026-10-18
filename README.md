# Gurgaon Properties: project landing pages

Static Astro site that generates compliant landing pages for residential projects in
Gurugram from YAML data files. One folder per project, no code changes per project.

## Quick start

```bash
npm install
npm run dev            # http://localhost:4321
npm run build          # Astro build + compliance scan of the built HTML
npm run check          # type check + compliance
npm test               # unit tests
```

## Add a project

```bash
npm run new-project -- <slug>
```

Then fill `src/content/projects/<slug>/project.yaml` with verified facts only, add images
with their license in `assets.yaml`, and run `npm run check`. Full guide: `docs/ADD-A-PROJECT.md` (Phase 7).

## Compliance gate

`npm run build` fails when, among other rules, a project that is not RERA registered
has a price or uses booking language, a page has an em-dash or not exactly one `<h1>`,
or an image is unlisted or unlicensed. `npm run build:production` additionally fails
while the agent RERA number, domain or contact numbers are placeholders. See `CLAUDE.md`.
