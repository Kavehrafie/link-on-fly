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
2. ✅ DONE (2026-10-20) — sticky per-visitor target: pure `pickTargetIndex` (injectable rng), per-path cookie name (slugified FULL path — leaf.slug alone collides), index-as-value with range re-validation (stale → re-pick). Notes: `tutorial/02-sticky-targets.md`.
3. ✅ DONE (2026-10-20) — R2 serving (binding `teaching_resc`, bucket `teaching-resc`), sync script (`bun run sync:r2`, `--remote` flag), typed Hono generic, streaming + Content-Type/Disposition. Notes: `tutorial/03-r2-and-expiry.md`.
4. 🔀 ABSORBED into the R2 stage — expiry middleware (410), middleware short-circuit, `c.set`/`c.get` with `Variables` generic. Ordering experiments + `createMiddleware` deferred to Lesson 6 (pass-key = second middleware).
5. hono/jsx pages (Layout, ExpiredPage, NotFoundPage) — tsconfig already has `jsxImportSource: hono/jsx`.
6. Pass-key bypass — OPEN DESIGN DECISION, discuss with user first (unlock semantics: listing page vs JSON vs cookie; key scope: per-leaf in YAML vs global secret vs both; timing-safe compare, wrangler secret, .dev.vars).
7. Tests: `app.request()` + Vitest; `@cloudflare/vitest-pool-workers` for R2; inject clock/RNG.
8. Logging: `hono/logger`, `wrangler tail`, observability config.
9. Deploy: wrangler deploy, prod R2 + secrets, custom domain, Cache-Control policy.

## Stage status (after R2 + expiry stage, 2026-10-20)

Current end state: guard middleware (lookup, 404/410 short-circuits, `c.set` stash) → serving handler (sticky cookie pick → url 302 / r2 stream with attachment headers). Sync script pushes uploads/ → bucket (`bun run sync:r2`, `--remote` for prod). Test fixtures in links.yaml: `archived-exam` (expired → 410) and `exam-set-missing.pdf` (missing object → 404) — removable once L7 tests exist.

## Lesson 5 — next: hono/jsx pages

1. Replace the string-imported `404.html`/`410.html` with jsx components: Layout, NotFoundPage, GonePage.
2. `jsxImportSource: hono/jsx` is already in tsconfig; SSR-only by default — no client runtime unless opted in.
3. Same checkpoint table as `tutorial/03` must still pass, byte-for-byte behavior.
4. Escaping is default-on; `raw()` only for deliberate html injection.

## Session workflow

At each checkpoint: review the diff, teach fixes via questions, user commits, Claude writes `tutorial/NN-*.md` notes and refreshes this STATE.md. When user is stuck: progressive hints, never full solutions.
