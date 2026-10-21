# Lesson 1 — YAML tree config, boot-time flatten, first serving

End state: `links.yaml` describes a recursive tree (array root, depth-3: `fall-2026/ah1105/<leaf>`), imported as text by the bundler, parsed **once at module scope**, flattened to a `Map<path, leaf>`, and served by a single catch-all route: unknown/container → 404 page, url target → 302, r2 target → 501 placeholder.

## Concepts learned

### Bundler powers ≠ runtime powers
- `rules: [{type: "Text", globs: ["**/*.yaml"]}]` in wrangler.jsonc is a **bundler** (esbuild) feature: it inlines the file as a string at build time.
- Node cannot `import` yaml — that's why the scratch file needed `readFileSync` + `new URL('../links.yaml', import.meta.url)` (cwd-immune, module-anchored).
- Each runtime ships a different loader set. SvelteKit/Next hide this behind their own pipelines.

### Ambient typing — generated vs hand-written
- `wrangler types` (npm run cf-typegen) generates `worker-configuration.d.ts`: runtime globals (why `console` typechecks with `lib: ["ESNext"]`) **plus** ambient module declarations for bundler imports (`*.yaml`, `*.txt`, `*.html`, `*.sql`, `*.bin`, `*.wasm`).
- Therefore hand-written `env.d.ts` is NOT needed on modern wrangler (4.151+) — lesson: **inspect the generated file before assuming** what it contains.
- Relative imports resolve from the **importing file's directory** (bitten twice: `./lib` vs `./lib.ts`, `./links.yaml` vs `../links.yaml`). Bundlers follow the same rule as Node ESM.

### Module scope = once per isolate boot
- `const routes = flattenTree(load(linksData) as Node[])` above `new Hono()` runs once when the isolate boots — free config caching. Parsing inside a handler = re-parsing on every request.
- **Q3, answered by experiment:** a boot-time throw does NOT fail the build (esbuild never parses YAML). `wrangler dev` dies at isolate startup with the uncaught error; `wrangler deploy` ships green and the Worker crash-loops in production. Boot-time validation is the only tripwire — never the build.

### Types
- **cast ≠ validation**: `load(yamlData) as Node[]` asserts, checks nothing. The cast became honest only when the yaml root was restructured to an array. Real validation must run at boot (deferred debt).
- Discriminated union: `type Target = {type: "r2", name: string} | {type: "url", src: string}` — different field per variant, narrowing via `target.type === "url"`.
- Node = Branch | Leaf via field presence (`'children' in node`).

### The flatten + key invariant
- `walkIntoTree` recursion must hand down the **full accumulated prefix**: `prefix + node.slug + '/'` (dropping the prefix breaks at depth ≥ 2 — and the depth-2-only test data hid it).
- Map keys carry a leading `/` (initial prefix `"/"`) so they match `c.req.path`'s format. The invariant: **keys and lookup must normalize identically** — pick either side, just be consistent.
- Trailing-slash policy (locked: resolve): strip exactly ONE trailing slash. `trimEnd()` trims whitespace, not slashes — it was dead code every time it appeared.

### 404 is a status, not a destination
- Anti-pattern (lived it): miss → `redirect('/404')` → with no `/404` route, infinite loop; with one, a "soft 404" where every miss ends 302→200 and looks alive to curl/crawlers.
- Correct: respond in place — `c.html(page404, 404)`.

### Handler idiom
- One lookup: `const leaf = routes.get(path); if (!leaf) return ...404` — replaces `has()` + `get()` (two hash lookups) and eliminates `?.` chains, since the guard proves `leaf` defined.
- Route order principle (specific before catch-all) observed when `/404` and `/` routes existed; moot while `*` is the only route, returns in Lesson 4 with `/health`.

## Checkpoint evidence (all green)

| request | response |
|---|---|
| `/fall-2026/ah1105` | 404 (container) |
| `/fall-2026/ah1105/resources` | 302 → one of 3 urls (random) |
| `/fall-2026/ah1105/resources/` | 302 (trailing slash resolves) |
| `/fall-2026/ah1105/midterm-exam` | 501 (R2 placeholder) |
| `/nonsense` | 404 |

## Deliberate simplifications (to revisit)

- Random pick is inline `Math.random` in the handler, **non-sticky** — every visit forgets. Lesson 2: pure `pickTarget()` + cookies.
- No yaml structural validation yet (container-XOR-leaf, slug collisions) — deferred.
- `scratch-flat.ts` deleted before commit; real yaml exercises depth-3, git history keeps the harness.
