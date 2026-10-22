# Lesson 4 — publish windows (425), zod schema layer, crown-inherited timezone & locale

> **Target-state spec for the in-progress stage.** Written ahead of completion so the
> finish line is explicit; tick it off as the code lands.
> Revised 2026-10-22: timezone/locale are **crown-only** — declared on the top-level
> entries, inherited by everything below, never overridden. All schemas are strict.

End state: an optional per-leaf `publishAt:` sends not-yet-published links to a **425 Too Early**
page showing the date; `expires:` is renamed to `expireAt:` (symmetry); **zod** validates the
whole YAML at boot (schema = one source of truth for types) and **rejects unknown keys**
(`strictObject` everywhere); `timezone:` (IANA name) and `locale:` (BCP-47 tag) may appear
**only on the crown** — the top-level entries of the array — and are inherited by everything
below, with UTC/en-CA fallbacks that `flattenTree` refuses to let decide a gated leaf's dates.

Boot flow to keep in mind while reading:

```
links.yaml → linksSchema.parse (validates + normalizes, rejects unknown keys)
           → flattenTree (enters crown context, refuses load-bearing defaults + duplicates)
           → routes Map. Requests look up and compare date STRINGS.
```

## `src/schema.ts` — the contract

```ts
// The links.yaml schema. Everything here describes what the YAML *may* say;
// schemas validate shape, flattenTree resolves structure (inheritance, defaults).
import z from "zod";

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidLocale(tag: string): boolean {
  try {
    Intl.getCanonicalLocales(tag);
    return true;
  } catch {
    return false;
  }
}

const timezoneField = z.string().refine(
  isValidTimeZone,
  "must be a valid IANA timezone name",
);
const localeField = z.string().refine(
  isValidLocale,
  "must be a valid IETF language tag",
);
const slugField = z.string().regex(
  /^[a-z0-9]+(-[a-z0-9]+)*$/,
  "lowercase letters, digits, hyphens",
);

// Accepts js-yaml's Date instances and quoted strings; normalizes both to a
// plain "YYYY-MM-DD" string. The refine guards the zero-padded shape that the
// middleware's lexicographic date comparison relies on.
const isoDate = z
  .union([z.date(), z.string()])
  .transform((d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d))
  .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s), "must be a YYYY-MM-DD date");

const targetSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("r2"), name: z.string() }),
  z.strictObject({ type: z.literal("url"), src: z.string() }),
]);

// Depth ≥ 1. Deliberately NO timezone/locale: the keys can't even be spelled
// below the crown, so a misplaced one is an "Unrecognized key" boot error —
// not a silent override.
const leafSchema = z.strictObject({
  title: z.string(),
  slug: slugField,
  description: z.string().optional(),
  expireAt: isoDate.optional(),
  publishAt: isoDate.optional(),
  targets: z.array(targetSchema),
});

type Branch = {
  title: string;
  slug: string;
  description?: string;
  children: (Branch | Leaf)[];
};

// Runtime recursion needs z.lazy (zod builds objects eagerly); the
// ZodType<Branch> annotation breaks the compile-time cycle (TS7022). The
// annotation also erases the ZodObject statics — which is why crownBranch
// below grows from branchBase, not from branchSchema.
const branchBase = z.strictObject({
  title: z.string(),
  slug: slugField,
  description: z.string().optional(),
});

const branchSchema: z.ZodType<Branch> = branchBase.extend({
  children: z.array(z.lazy(() => nodeSchema)),
});

const nodeSchema = z.union([leafSchema, branchSchema]);

// The crown: depth-0 entries of the array. The ONLY level where timezone/
// locale may be declared; everything below inherits. The rule is positional,
// not semantic — a crown can be an institution, a project, or a one-off page.
const crownLeaf = leafSchema.extend({
  timezone: timezoneField.optional(),
  locale: localeField.optional(),
});

const crownBranch = branchBase.extend({
  timezone: timezoneField.optional(),
  locale: localeField.optional(),
  children: z.array(z.lazy(() => nodeSchema)),
});

// The whole links.yaml document: a list of crown entries.
const linksSchema = z.array(z.union([crownLeaf, crownBranch]));

export { linksSchema };

type Leaf = z.infer<typeof leafSchema>;
type Target = z.infer<typeof targetSchema>;
type Node = z.infer<typeof nodeSchema>;
type CrownLeaf = z.infer<typeof crownLeaf>;
type CrownBranch = z.infer<typeof crownBranch>;
type CrownNode = CrownLeaf | CrownBranch;

// Resolved by flattenTree: inherited-and-defaulted, guaranteed present (and
// valid) on everything stored in the tree.
type FlatLeaf = Leaf & { timezone: string; locale: string };
type FlatTree = Map<string, FlatLeaf>;

export type {
  Branch,
  Leaf,
  Target,
  Node,
  CrownLeaf,
  CrownBranch,
  CrownNode,
  FlatLeaf,
  FlatTree,
};
```

Why it's shaped this way:

- **Shared field fragments** (`timezoneField`, `localeField`, `slugField`, `branchBase`)
  compose — one definition, several schemas, zero drift.
- **`strictObject` everywhere** (nodes and targets alike): a key the schema doesn't declare is
  an `Unrecognized key` boot error naming the exact path. That's typo insurance for every field
  (`expireat:`), it future-proofs lesson 6 (pass-key fields will have to be declared to exist),
  and it's the mechanism that makes crown-only enforceable: nested schemas don't declare
  `timezone`/`locale`, so a misplaced key isn't a silent override — it's a crash.
- **The crown rule is positional, not semantic.** `nodeSchema` (nested) and the crown pair are
  the same shapes ± two optional keys. No "institution" type: what a crown *means* (university,
  project, one-off page) is the deployment's business; the schema only fixes where the keys may
  live. Two crowns may disagree (different campus, different zone) — divergence *within* one
  crown's subtree is what's unrepresentable.
- **The refines fail fast at boot**: a typo'd zone (`America/Edmontn`) or locale tag (`enUS`)
  crashes dev with a named error instead of a per-request 500 or a silent fallback.
  (Note the asymmetry: an *invalid* locale tag throws in `Intl`, but a well-formed unknown
  one (`xx-YY`) silently falls back — the refine catches the typo case.)
- **`isoDate` kills the `Date | string` duality**: both YAML shapes normalize to a plain
  `"2026-10-25"` string at parse time. The `instanceof Date` dance in the middleware and a
  helper like `asISODate` become unnecessary — validation IS the conversion.
- **`branchBase` exists because annotations erase statics**: `branchSchema` is annotated
  `z.ZodType<Branch>` (that + `z.lazy` in `children` breaks the compile-time cycle), but a
  `ZodType` annotation leaves no `.extend` — so the crown variant grows from the shared,
  unannotated base instead. `Leaf` is inferred (`z.infer`); `Branch` is hand-written, since
  recursive types can't infer themselves.
- **`z.union` needs no discriminator**: leaves have `targets`, branches have `children` —
  structurally disjoint at every depth, crown or not.
- **`FlatLeaf = Leaf & { timezone: string; locale: string }`**: the type system encodes
  "the walk resolved these" — downstream code needs no fallbacks for either field.

## `src/lib.ts` — pure logic

```ts
import type { CrownNode, FlatLeaf, FlatTree, Leaf, Node, Target } from "./schema";

// Gate formatter: "en-CA" is load-bearing — its YYYY-MM-DD output is what makes
// plain string comparison correct. Never parameterize this locale.
const gateFormatters = new Map<string, Intl.DateTimeFormat>();

function todayIn(timezone: string): string {
  let fmt = gateFormatters.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    gateFormatters.set(timezone, fmt);
  }
  return fmt.format(new Date());
}

// Display formatter: locale is welcome here — humans read this, parsers don't.
// timeZone: "UTC" preserves the calendar day as written in the YAML.
function formatDisplayDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", dateStyle: "long" }).format(
    new Date(iso),
  );
}

// The walk only builds paths now — context doesn't thread through it. The
// crown's timezone/locale are captured by the caller's closure; no node below
// the crown can override them because the schema forbids the keys.
interface WalkOptions {
  prefix: string;
  onLeaf: (leaf: Leaf, prefix: string) => void;
}

function walkIntoTree(tree: Node[], opts: WalkOptions): void {
  for (const node of tree) {
    if ("children" in node) {
      walkIntoTree(node.children, { ...opts, prefix: opts.prefix + node.slug + "/" });
    } else {
      opts.onLeaf(node, opts.prefix);
    }
  }
}

function flattenTree(tree: CrownNode[]): FlatTree {
  const flatTree = new Map<string, FlatLeaf>();

  for (const crown of tree) {
    // Context enters the tree exactly once — here, at the crown.
    const resolved = {
      timezone: crown.timezone ?? "UTC",
      locale: crown.locale ?? "en-CA",
    };
    // A defaulted timezone may exist — but if it ends up deciding when a
    // gated leaf opens or dies, the deployment's dates are a guess. Refuse.
    const zoneDeclared = crown.timezone !== undefined;

    const put = (leaf: Leaf, prefix: string) => {
      const key = prefix + leaf.slug;
      if (flatTree.has(key)) throw new Error(`Duplicate route: ${key}`);
      if (!zoneDeclared && (leaf.publishAt !== undefined || leaf.expireAt !== undefined)) {
        throw new Error(`${key}: publish window but no timezone — declare timezone: on the crown`);
      }
      flatTree.set(key, { ...leaf, ...resolved });
    };

    if ("children" in crown) {
      walkIntoTree(crown.children, { prefix: `/${crown.slug}/`, onLeaf: put });
    } else {
      put(crown, "/");
    }
  }

  return flatTree;
}

function pickTargetIndex(targets: Target[], rng: () => number = Math.random): number {
  if (targets.length === 0) throw new Error("No targets available to pick from.");
  return Math.floor(rng() * targets.length);
}

export { flattenTree, formatDisplayDate, pickTargetIndex, todayIn };
```

Why it's shaped this way:

- **The walk got simpler on purpose.** The old `WalkOptions` threaded `prefix`, `timezone` and
  `locale` with a `??` resolution at every node — inheritance machinery in code. The schema
  took over the discipline, so inheritance happens exactly once per crown and the walk only
  carries the prefix. Less code because there's less to guarantee.
- **Defaults: allowed to exist, forbidden to matter.** A crown without `timezone:` boots fine —
  until a leaf below it has `publishAt`/`expireAt`, and then it's a boot throw, because at that
  point "UTC" isn't a default, it's a guess about students' access. `locale` never gets this
  guard: presentation. A defaulted locale costs an ugly date string, never a missed exam.
- **Two structural throws, one function.** Duplicate routes and load-bearing defaults are both
  cross-node invariants — legal per-node, broken per-tree. Schemas validate node shape; code
  validates structure (same boundary doctrine as before — the crown guard joins
  `Duplicate route` at it).
- **Two formatters, two jobs.** The gate formatter's locale is *load-bearing* (`en-CA` emits
  zero-padded ISO, which is what makes `>` / `<` string comparison correct) — it takes a
  timezone, never a locale. The display formatter's locale is *presentation* — humans read
  it, no parser does. Passing a YAML `locale` into the gate (e.g. `en-US` → `10/21/2026`)
  silently breaks every date comparison.
- **Display renders the written calendar day, not a re-projection**: `new Date("2026-10-23")`
  is UTC midnight; formatting that *in* `America/Edmonton` would show "October 22". Rendering
  with `timeZone: "UTC"` preserves the authored day.
- **Formatter `Map` cache**: the zone is data, so there's no single constant to hoist — cache
  per key instead.

## `src/index.ts` — the composition root

```ts
import { Hono } from "hono";
import linksData from "../links.yaml";
import page404 from "./404.html";
import page410 from "./410.html";
import page425 from "./425.html";
import { load } from "js-yaml";
import { flattenTree, formatDisplayDate, pickTargetIndex, todayIn } from "./lib";
import { linksSchema, type FlatLeaf, type FlatTree } from "./schema";
import { getCookie, setCookie } from "hono/cookie";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  png: "image/png",
};

const app = new Hono<{
  Bindings: CloudflareBindings;
  Variables: { leaf: FlatLeaf; path: string };
}>();

// Boot: parse (validates + normalizes) → flatten (crown context, uniqueness).
const routes: FlatTree = flattenTree(linksSchema.parse(load(linksData)));

// Guard middleware: one lookup, then the short-circuits. Returning without
// calling next() ends the request here — the handler never runs.
app.use("*", async (c, next) => {
  const path = c.req.path.endsWith("/") ? c.req.path.slice(0, -1) : c.req.path;
  const leaf = routes.get(path);
  if (!leaf) return c.html(page404, 404);

  const today = todayIn(leaf.timezone);
  const publishDate = leaf.publishAt;
  const expireDate = leaf.expireAt;

  // "gone" outranks "not yet" — contradictory config resolves to 410.
  if (expireDate !== undefined && expireDate < today) return c.html(page410, 410);
  if (publishDate !== undefined && publishDate > today) {
    const page = page425.replace("{{availableAfter}}", () =>
      formatDisplayDate(publishDate, leaf.locale),
    );
    return c.html(page, 425);
  }

  c.set("leaf", leaf);
  c.set("path", path);
  await next();
});

// GET handler unchanged: sticky-cookie target pick → url 302 / R2 stream.
```

Details worth noticing:

- **`linksSchema.parse(load(linksData))` replaces the `as Node[]` cast.** Malformed YAML now
  crashes boot with a zod report naming the exact path/field. `flattenTree` takes the parsed
  crown entries; the request side is untouched.
- **Boundaries are inclusive**: gate is `publishAt > today` (unlocks ON the date) and
  `expireAt < today` (dies the day after expiry) — the window [publishAt, expireAt] serves.
- **Ordering: 410 checked before 425** — contradictory config resolves to "gone".
- **Hoisting `publishDate` to a `const` before the check isn't style**: TS narrowing doesn't
  survive into the `.replace` closure through a property access; the const carries the
  narrowed `string` in. No cast, no `undefined` possible.
- **`() =>` as the replacement** — the function form of `.replace` is immune to `$`-pattern
  interpretation in the replacement string. One-character insurance.
- **`Variables.leaf` is now `FlatLeaf`** — the stash carries the resolved leaf.

## YAML shape

```yaml
# Crown entries — the ONLY level that may declare timezone/locale.
- title: Mountain University
  slug: mountain-u
  timezone: America/Edmonton   # optional; inherited below (fallback UTC, guarded)
  locale: en-US                # optional; inherited below (fallback en-CA)
  children:
    - title: Fall 2026
      slug: fall-2026          # from here down, timezone/locale can't even be spelled
      children:
        - title: ah1105
          slug: ah1105
          children:
            - title: midterm exam
              slug: midterm-exam
              publishAt: 2026-10-23   # unlocks ON this date (crown timezone)
              expireAt: 2026-10-25    # dies the day after (crown timezone)
              targets: [...]

# A second crown may disagree with the first — different campus, different zone:
# - title: Island College
#   slug: island-c
#   timezone: America/Vancouver
#   ...
```

URLs carry the crown slug: `/mountain-u/fall-2026/ah1105/midterm-exam`.

## Principles (the one-liners)

1. **Validate at the boundary, resolve in the middle, compare at the edge** — zod at boot,
   flattenTree for crown context/uniqueness, plain string comparison per request.
2. **Schema = what the YAML may say; walk = what the app guarantees** (`Leaf` vs `FlatLeaf`).
3. **Timezone = semantics, locale = presentation** — and the gate formatter's `en-CA` is
   load-bearing, never parameterized.
4. **Fail fast at boot, in this order**: strict/refine errors → load-bearing-default throw →
   duplicate-route throw.
5. **parse, don't validate**: `isoDate` doesn't just check dates, it converts them once so
   no downstream code ever sees the duality.
6. **Positional, not semantic**: the crown rule constrains *where* a key may appear, never
   what a node means — crowns can be institutions, projects, or one-offs.
7. **Defaults may exist, but must never be load-bearing** — a fallback that decides when
   students get access is a guess, and guesses crash at boot.

## Checkpoint evidence (must pass)

1. `/mountain-u/fall-2026/ah1105/midterm-exam` → **425**, page shows "October 23, 2026"
   (en-US display from the crown locale, while the gate itself stayed Edmonton-correct).
2. `/mountain-u/fall-2026/ah1105/archived-exam` → **410** (crown declares a timezone but no
   locale — the en-CA display fallback is exercised; safe, locale is presentation).
3. `/mountain-u/fall-2026/ah1105/resources` → **302**.
4. Boundary tests (wrangler hot-reloads YAML): `publishAt: <today>` → serves; `expireAt:
   <today>` → serves; `expireAt: <yesterday>` → 410.
5. Typo test: crown `timezone: America/Edmontn` → dev crashes at boot with the refine message.
6. Duplicate-slug test: two sibling leaves with the same slug → boot throws `Duplicate route`.
7. Malformed YAML test: `slug: "My Slug"` → boot zod error naming the exact path.
8. Strict test: `timezone:` on a *nested* branch (e.g. under `fall-2026`) → boot crash,
   `Unrecognized key`, exact path.
9. Load-bearing-defaults test: remove the crown's `timezone:`, keep a leaf's `publishAt:` →
   boot throws the publish-window error. (Remove `timezone:` with no gated leaves → boots.)
10. Two-crown test: crown A `America/Edmonton`, crown B `America/Vancouver`, same `publishAt`
    on both — each gate computes its own correct "today". The payoff demo.
