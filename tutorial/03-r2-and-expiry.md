# Lesson 3(+4) — R2 bindings, sync script, expiry middleware

End state: `r2` targets stream real objects from the bucket; optional per-leaf `expires:` sends expired links to a 410 page; a sync script keeps uploads/ and the bucket in step. The route is now two pieces: a guard **middleware** (404/410/lookup) and a lean serving handler.

## Bindings = the Workers DI container

- Declare in wrangler.jsonc (`binding` + `bucket_name`), the platform injects the client at boot on **`c.env`** — never globals (envs differ dev/prod).
- **binding ≠ bucket name** (hit live): the binding (`teaching_resc`) is the code-side identifier; the CLI takes the bucket NAME (`teaching-resc`) — and R2 names only allow lowercase/digits/hyphens. Two namespaces, two spellings.
- After ANY wrangler.jsonc change: `npm run cf-typegen` → `CloudflareBindings.teaching_resc: R2Bucket`.
- App typing: `new Hono<{ Bindings: CloudflareBindings; Variables: { leaf: Leaf; path: string } }>()` — the generic is what makes `c.env.teaching_resc`, `c.set`, and `c.get` typecheck.

## R2 serving

```
const obj = await c.env.teaching_resc.get(name)   // R2ObjectBody | null
if (!obj) return c.html(page404, 404)             // missing key = 404, not 500
return c.body(obj.body, 200, { "Content-Type": ..., "Content-Disposition": `attachment; filename=...` })
```

- `obj.body` is a Web ReadableStream — **streamed, not buffered**; `c.body()` passes it straight through. No node builtins exist in worker code (extension sniffing is hand-rolled `lastIndexOf('.')`).
- `Content-Disposition: attachment` forces download (right for exams); `inline` would render in-browser.
- Content-Type: we set it at serve time from the extension — our header wins; R2's stored httpMetadata is only a default.

## The sync script (`scripts/sync-r2.mjs`, `bun run sync:r2`)

- Push loop over uploads/ → `wrangler r2 object put <bucket>/<basename> --content-type <mime>`; `--local` unless `--remote` passed.
- Local emulation and the remote bucket are **separate stores** — dev-sync fills the emulator; `--remote` fills prod (needs `wrangler login`).
- Push-only: renames leave stale objects behind (fine for v1).
- uploads/ is gitignored (real exams stay out of git) — so the script is also the restore path on a fresh clone; consider fake fixtures tracked in git later.

## Middleware + expiry (Lesson 4 core, pulled forward)

- `app.use("*", middleware)` — guard work happens before the handler; **returning without `await next()` short-circuits** (Echo: `return` instead of `next(c)`).
- Ordering: middleware registered before the route runs first; with only one middleware this is quiet — ordering experiments land in Lesson 6 when the pass-key becomes middleware #2.
- `c.set("leaf", ...)` / `c.get("leaf")` — request-scoped state passing from middleware to handler; the `Variables` generic is what types it.
- Expiry: optional per-leaf `expires:` in yaml. js-yaml parses ISO dates into **Date instances** (not strings) — normalize with `instanceof Date` before comparing; compare epoch vs `Date.now()`.
- 404 vs 410 semantics: 404 = never existed/unknown; **410 Gone = deliberately removed/expired** — clients and caches are told to stop asking.

## Checkpoint evidence

- `midterm-exam` with cookie index=0 → 200, `application/pdf`, attachment, bytes served
- cookie index=3 (`exam-set-missing.pdf`) → 404
- `/fall-2026/ah1105/archived-exam` → 410 Gone
- resources with jar → sticky 302s; `/nonsense` → 404

## Debt list (carried forward)

- yaml boot validation: container-XOR-leaf, slug collisions, non-empty targets
- two-path cookie independence unverified (needs a second url leaf)
- `Secure` cookie flag at deploy time (Lesson 9)
- jsx pages will replace the string-typed 404/410 html imports (Lesson 5)
