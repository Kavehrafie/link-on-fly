# Lesson 2 — Sticky targets: one exam set per student

End state: every visitor gets exactly ONE target of a leaf and keeps it — cookie remembers the picked index per leaf. First visit picks randomly and sets the cookie; every later visit reads it. `pickTargetIndex()` is a pure function in lib.ts.

## Cookies are just headers

`Set-Cookie` (response) + `Cookie` (request). `hono/cookie` wraps them: `getCookie(c, name)` → `string | undefined`; `setCookie(c, name, value, options)`. Options go in **one object literal** — the main syntax trap.

Attributes (all visible in the checkpoint's Set-Cookie header):

| attribute | our value | defends against |
|---|---|---|
| `Max-Age` | 2592000 (30d) | forgetting (vs session cookies: no Max-Age/Expires = browser-lifetime) |
| `Path` | `/` | scope creep (a Path-scoped cookie is only sent for that URL subtree) |
| `HttpOnly` | on | page JavaScript reading the cookie (XSS exfiltration) |
| `SameSite` | `Lax` | cross-site sends (CSRF; Lax allows top-level GET nav only) |

`Secure` is omitted locally; add it for production HTTPS (Lesson 9).

## Naming: RFC tokens and the slug ≠ path trap

Cookie names are RFC tokens: no `/`, no `:`. We slugify — but the source matters:
- `leaf.slug` is only the LAST segment (`resources`). Two courses with a `resources` leaf would **collide on one cookie** and swap targets.
- The name must derive from the **full path**: `target-of_${path.replace(/[^a-zA-Z0-9]/g, "_")}` → `target-of__fall_2026_ah1105_resources`.

## Value = index, validated on read

Store `String(index)`, not the src or the object — cookies hold strings, indexes survive url renames, and they're cheap to validate. On read:

```
parsed = Number(remembered)          // NaN-safe vs parseInt quirks
index  = Number.isInteger(parsed) && 0 <= parsed < targets.length ? parsed : undefined
```

Out-of-range (yaml edited, targets reshuffled) → `undefined` → **fresh pick**, never `targets[undefined]`.

## Pure randomness → testable

`pickTargetIndex(targets, rng = Math.random): number` — default param injects `Math.random`, but tests (Lesson 7) pass `() => 0` for deterministic picks. The empty-array guard throws — an empty targets list is a config error, not a runtime event.

## The flow — one selection point

1. read cookie → parse → range-validate → `index` or `undefined`
2. `undefined` → `pickTargetIndex()` + `setCookie` (the ONLY write)
3. serve `targets[index]` from a single point

Classic bug we hit: the inverted flow — cookie written *before* a pick exists and never read back (write-but-never-read). Symptom: still non-sticky despite Set-Cookie. If behavior doesn't change after adding persistence, ask "who reads this?"

## Checkpoint evidence

- 5 bare curls → 3 different Locations (varies)
- jar first visit → `Set-Cookie: target-of__fall_2026_ah1105_resources=1; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`
- 5 jar curls → identical Location, **no repeated Set-Cookie**
- jar file shows `#HttpOnly_` flag persisted

## Still owed (debt list)

- yaml boot-time validation (container-XOR-leaf, slug collisions, non-empty targets)
- Two-path independence check (needs a second url leaf)
- `Secure` cookie flag at deploy (Lesson 9)
