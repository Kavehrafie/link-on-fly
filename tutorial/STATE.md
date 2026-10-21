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
1. ✅ DONE (2026-10-20) — yaml tree (array root, depth-3), Text rule import, module-scope parse+flatten, catch-all route, inline 404 page / 302 url / 501 r2 placeholder. Notes: `tutorial/01-config-tree-and-serving.md`. Conventions: Map keys carry leading `/` (match `c.req.path`); r2 targets use `name:`, url use `src:`; Target union lives in lib.ts; env.d.ts gone (worker-configuration.d.ts covers yaml declarations).
2. **🔄 IN PROGRESS** — Multiple targets, sticky per visitor (`hono/cookie`, pick-target pure function, per-slug cookies).
3. R2: binding in wrangler.jsonc, `wrangler types`, typed `Hono<{ Bindings }>` (Bindings via `c.env`), stream objects, Content-Type/Disposition.
4. Middleware: expiry check → 410; custom middleware, ordering, `c.set/c.get`.
5. hono/jsx pages (Layout, ExpiredPage, NotFoundPage) — tsconfig already has `jsxImportSource: hono/jsx`.
6. Pass-key bypass — OPEN DESIGN DECISION, discuss with user first (unlock semantics: listing page vs JSON vs cookie; key scope: per-leaf in YAML vs global secret vs both; timing-safe compare, wrangler secret, .dev.vars).
7. Tests: `app.request()` + Vitest; `@cloudflare/vitest-pool-workers` for R2; inject clock/RNG.
8. Logging: `hono/logger`, `wrangler tail`, observability config.
9. Deploy: wrangler deploy, prod R2 + secrets, custom domain, Cache-Control policy.

## Lesson 2 — in progress (opened 2026-10-20)

Goal: exactly ONE target per visitor, sticky via cookie (exam-set use case). Current behavior: inline `Math.random` pick on EVERY request — non-sticky.

User tasks:
1. `pickTarget(targets: Target[], rng: () => number = Math.random): Target` — pure function in lib.ts; injectable rng → deterministic tests in Lesson 7. Export Target.
2. Per-leaf cookie name derived from the path. Cookie names are RFC tokens: no `/`, no `:` — slugify (readable, devtools-friendly) or hash. Store the picked INDEX as the value; validate range on read (yaml edits shift indexes → re-pick on stale).
3. Sticky flow in the handler: cookie hit + valid index → serve that target; miss/stale → pickTarget, setCookie, serve.
4. Cookie attributes: httpOnly, sameSite: 'Lax', maxAge ~30d, path '/' (know Path-scoping exists).
5. Replace inline Math.random with pickTarget call.

Checkpoint: repeated curls (no jar) vary; with `curl -c jar -b jar` stable; two different paths stick independently in one jar.

## Session workflow

At each checkpoint: review the diff, teach fixes via questions, user commits, Claude writes `tutorial/NN-*.md` notes and refreshes this STATE.md. When user is stuck: progressive hints, never full solutions.
