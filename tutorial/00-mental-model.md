# Lesson 0 — The Hono mental model

## Workers ≠ Node server

- A Cloudflare Worker is a **fetch handler**: the runtime hands you a Web-standard `Request`, you return a Web-standard `Response`. No `fs`, no express req/res, no listening port.
- `export default app` works because a Hono app *is* an object with a `fetch(request, env, ctx)` method.
- `wrangler dev` runs **workerd** — the real Cloudflare runtime — locally, with hot reload.

## Hono vs SvelteKit/Next

| | SvelteKit / Next | Hono |
|---|---|---|
| Routing | file-based, implicit | explicit, one app object built in code |
| Middleware | one `hooks.server.ts` / `middleware.ts` | any number, on any path, hand-written (onion model) |
| Per-request bag | `event` / `locals` | the Context `c` (`c.set`/`c.get`) |
| Platform escape hatch | `event.platform.env` | `c.env` (bindings) |

## The Context `c` — response helpers

- `c.text()` / `c.json()` / `c.html()` — set `Content-Type` automatically
- `c.redirect(url, status?)` — default 302
- Status via second arg: `c.text('nope', 404)` or `c.text('nope', { status: 404 })`

## What the experiments showed

- **Unregistered path** → Hono's built-in default: `404 Not Found` as plain text. Customizable later via `app.notFound()`.
- **Uncaught `throw` in a handler** → Hono's default `app.onError` catches it, returns `500 Internal Server Error`. The app does **not** crash — each request is isolated. Customizable via `app.onError` (useful in Lesson 1+).
- Error details go to the dev-server console, not the response body (in prod: logs — Lesson 8).

## Isolates (the big one)

Top-level code in `src/index.ts` runs **once per isolate boot**, not once per request. One running Worker = many isolates across machines; each isolate boots once, then serves many requests. Consequences:

- Module-scope state = free per-isolate cache (we exploit this for `links.yaml` in Lesson 1).
- Anything request-specific must never live at module scope.
