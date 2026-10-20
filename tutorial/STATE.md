# STATE — read me first (handoff for any new session)

**Context:** link-on-fly is a learn-Hono tutorial project. The user is building it themselves; Claude teaches, reviews diffs at checkpoints, and writes one notes file per lesson into `tutorial/`. The USER writes every line of app code — never write app source for them (tiny API-shape examples in chat are fine). Hints before answers. User background: SvelteKit/Next + Go's Echo (map Hono to Echo when useful). Today's date when this started: 2026-10-19.

## The app (locked model)

A Cloudflare Worker (Hono) that serves as an access point to assets/links. Real use case: distributing exam sets to students — each visitor gets exactly ONE target of a leaf, sticky per visitor (cookie). Instructor pass-key bypasses (behavior NOT yet designed — deferred to Lesson 6, design it WITH the user then).

- `links.yaml` is a recursive TREE: nodes are container (`children:`) OR leaf (`targets:`), never both; arbitrary depth.
- Node URL = ancestor slugs joined with `/`; root slug may contain slashes (e.g. `fall-2026/ah1105`).
- Only leaves resolve. Container URLs and unknown paths → 404.
- Targets: `type: r2object` (object key in one R2 bucket) | `type: url` (external redirect).
- YAML lives in the repo, imported via wrangler Text rule, parsed once at module scope (isolate boot); tree flattened to `Map<path, leaf>` at boot with collision/validation errors thrown at boot (fail fast).
- Expiry (optional per leaf, future): expired → 410 Gone page.

## Lesson roadmap

0. ✅ Template, Hono mental model, status experiments — notes in `tutorial/00-mental-model.md`.
1. **🔄 IN PROGRESS** — tree config, recursive types, boot-time flatten to Map, catch-all `app.get('*')` route, 404 for containers/unknown, serve `targets[0]` (url → 302 redirect; r2object → 501 placeholder until Lesson 3). User was extracting tree logic into `src/lib.ts`.
2. Multiple targets, sticky per visitor (`hono/cookie`, pick-target pure function, per-slug cookies).
3. R2: binding in wrangler.jsonc, `wrangler types`, typed `Hono<{ Bindings }>` (Bindings via `c.env`), stream objects, Content-Type/Disposition.
4. Middleware: expiry check → 410; custom middleware, ordering, `c.set/c.get`.
5. hono/jsx pages (Layout, ExpiredPage, NotFoundPage) — tsconfig already has `jsxImportSource: hono/jsx`.
6. Pass-key bypass — OPEN DESIGN DECISION, discuss with user first (unlock semantics: listing page vs JSON vs cookie; key scope: per-leaf in YAML vs global secret vs both; timing-safe compare, wrangler secret, .dev.vars).
7. Tests: `app.request()` + Vitest; `@cloudflare/vitest-pool-workers` for R2; inject clock/RNG.
8. Logging: `hono/logger`, `wrangler tail`, observability config.
9. Deploy: wrangler deploy, prod R2 + secrets, custom domain, Cache-Control policy.

## Lesson 1 — still owed by the user

- Fix links.yaml: `targets` plural, consistent `r2object`, add a `resources` leaf with 2–3 url targets (so lessons 1–2 test without R2).
- `src/env.d.ts` ambient declaration for `*.yaml` imports; js-yaml + @types/js-yaml installed; wrangler.jsonc `rules: [{ type: "Text", globs: ["**/*.yaml"] }]`.
- Recursive types (Target discriminated union; Node = Branch | Leaf via field presence), `flattenTree()` in `src/lib.ts`, catch-all route, trailing-slash policy decision.
- **Three questions they must answer:** (1) why must `/health` be registered before `*`? (2) trailing-slash policy — resolve or 404, and why; (3) where does a boot-time throw surface in `wrangler dev`?
- Checkpoint curls: `/fall-2026/ah1105` → 404 (container), `/fall-2026/ah1105/resources` → 302, `/fall-2026/ah1105/midterm-exam` → 501, `/nonsense` → 404. Then review their `src/index.ts` + `src/lib.ts` + `links.yaml`, have them commit, write `tutorial/01-*.md` notes, update this file.

## Session workflow

At each checkpoint: review the diff, teach fixes via questions, user commits, Claude writes `tutorial/NN-*.md` notes and refreshes this STATE.md. When user is stuck: progressive hints, never full solutions.
