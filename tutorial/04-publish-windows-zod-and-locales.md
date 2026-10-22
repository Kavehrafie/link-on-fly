# Lesson 4 — publish windows (425), zod schema layer, timezone & locale inheritance

> **Target-state spec for the in-progress stage.** Written ahead of completion so the
> finish line is explicit; tick it off as the code lands.

End state: an optional per-leaf `publishAt:` sends not-yet-published links to a **425 Too Early**
page showing the date; `expires:` is renamed to `expireAt:` (symmetry); **zod** validates the
whole YAML at boot (schema = one source of truth for types); `timezone:` (IANA name) and
`locale:` (BCP-47 tag) are **inherited down the tree** like slugs, with leaf-level override.

Boot flow to keep in mind while reading:

```
links.yaml → linksSchema.parse (validates + normalizes) → flattenTree (resolves inheritance,
checks uniqueness) → routes Map. Requests look up and compare date STRINGS.
```

## `src/types.ts` — the contract

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
    new Intl.getCanonicalLocales(tag);
    return true;
  } catch {
    return false;
  }
}

const timezoneField = z.string().refine(isValidTimeZone, "unknown IANA time zone");
const localeField = z.string().refine(isValidLocale, "invalid locale tag");
const slugField = z.string().regex(
  /^[a-z0-9]+(-[a-z0-9]+)*$/,
  "lowercase letters, digits, hyphens",
);

// Accepts js-yaml Date instances and quoted strings; normalizes both to
// "YYYY-MM-DD". The refine guards the zero-padded shape the middleware's
// string comparison relies on.
const isoDate = z
  .union([z.date(), z.string()])
  .transform((d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d))
  .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s), "must be a YYYY-MM-DD date");

const targetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("r2"), name: z.string() }),
  z.object({ type: z.literal("url"), src: z.string() }),
]);

const leafSchema = z.object({
  title: z.string(),
  slug: slugField,
  description: z.string().optional(),
  expireAt: isoDate.optional(),
  publishAt: isoDate.optional(),
  timezone: timezoneField.optional(),
  locale: localeField.optional(),
  targets: z.array(targetSchema),
});

type Branch = {
  title: string;
  slug: string;
  description?: string;
  timezone?: string;
  locale?: string;
  children: (Branch | Leaf)[];
};

const branchSchema: z.ZodType<Branch> = z.object({
  title: z.string(),
  slug: slugField,
  description: z.string().optional(),
  timezone: timezoneField.optional(),
  locale: localeField.optional(),
  children: z.array(z.lazy(() => nodeSchema)),
});

const nodeSchema = z.union([leafSchema, branchSchema]);
const linksSchema = z.array(nodeSchema);

type Leaf = z.infer<typeof leafSchema>;
type Target = z.infer<typeof targetSchema>;
type Node = z.infer<typeof nodeSchema>;

// Resolved by flattenTree: inherited-and-defaulted, guaranteed present and valid.
type FlatLeaf = Leaf & { timezone: string; locale: string };
type FlatTree = Map<string, FlatLeaf>;

export { linksSchema };
export type { Branch, Leaf, Target, Node, FlatLeaf, FlatTree };
```

Why it's shaped this way:

- **Shared field fragments** (`slugField`, `timezoneField`, `localeField`) compose — one
  definition, both schemas, zero drift.
- **The refines fail fast at boot**: a typo'd zone (`America/Edmontn`) or locale tag (`enUS`)
  crashes dev with a named error instead of a per-request 500 or a silent fallback.
  (Note the asymmetry: an *invalid* locale tag throws in `Intl`, but a well-formed unknown
  one (`xx-YY`) silently falls back — the refine catches the typo case.)
- **`isoDate` kills the `Date | string` duality**: both YAML shapes normalize to a plain
  `"2026-10-25"` string at parse time. The `instanceof Date` dance in the middleware and a
  helper like `asISODate` become unnecessary — validation IS the conversion.
- **`Leaf` is inferred (`z.infer`), `Branch` is hand-written**: recursive types can't infer
  themselves — the schema's own annotation needs the type first. The
  `z.ZodType<Branch>` annotation on the const + `z.lazy` in `children` is the pairing that
  breaks the compile-time cycle (TS7022) while allowing runtime recursion.
- **`z.union([leafSchema, branchSchema])` needs no discriminator**: the shapes are
  structurally disjoint (branches have `children`, leaves have `targets`).
- **`FlatLeaf` = `Leaf & { timezone: string; locale: string }`**: the type system encodes
  "the walk resolved these" — downstream code needs no fallbacks for either field.

## `src/lib.ts` — pure logic

```ts
import type { FlatLeaf, FlatTree, Leaf, Node, Target } from "./types";

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

interface WalkOptions {
  prefix: string;
  timezone: string;
  locale: string;
  onLeaf: (leaf: Leaf, prefix: string, resolved: { timezone: string; locale: string }) => void;
}

function walkIntoTree(tree: Node[], opts: WalkOptions): void {
  for (const node of tree) {
    const timezone = node.timezone ?? opts.timezone;
    const locale = node.locale ?? opts.locale;
    if ("children" in node) {
      walkIntoTree(node.children, {
        prefix: opts.prefix + node.slug + "/",
        timezone,
        locale,
        onLeaf: opts.onLeaf,
      });
    } else {
      opts.onLeaf(node, opts.prefix, { timezone, locale });
    }
  }
}

function flattenTree(tree: Node[]): FlatTree {
  const flatTree = new Map<string, FlatLeaf>();
  walkIntoTree(tree, {
    prefix: "/",
    timezone: "UTC", // defaults live here — the one place a root exists
    locale: "en-CA",
    onLeaf: (leaf, prefix, resolved) => {
      const key = prefix + leaf.slug;
      if (flatTree.has(key)) throw new Error(`Duplicate route: ${key}`);
      flatTree.set(key, { ...leaf, ...resolved });
    },
  });
  return flatTree;
}

function pickTargetIndex(targets: Target[], rng: () => number = Math.random): number {
  if (targets.length === 0) throw new Error("No targets available to pick from.");
  return Math.floor(rng() * targets.length);
}

export { flattenTree, formatDisplayDate, pickTargetIndex, todayIn };
```

Why it's shaped this way:

- **`prefix`, `timezone`, `locale` are the same pattern**: inherited context threaded through
  recursion, resolved per node via `??` (override at this level, inherit otherwise), stored
  resolved. Defaults exist only at the root call.
- **Two formatters, two jobs.** The gate formatter's locale is *load-bearing* (`en-CA` emits
  zero-padded ISO, which is what makes `>` / `<` string comparison correct) — it takes a
  timezone, never a locale. The display formatter's locale is *presentation* — humans read
  it, no parser does. Passing a YAML `locale` into the gate (e.g. `en-US` → `10/21/2026`)
  silently breaks every date comparison.
- **Display renders the written calendar day, not a re-projection**: `new Date("2026-10-23")`
  is UTC midnight; formatting that *in* `America/Edmonton` would show "October 22". Rendering
  with `timeZone: "UTC"` preserves the authored day.
- **Formatter `Map` cache**: the zone/locale are data now, so there's no single constant to
  hoist — cache per key instead.
- **Duplicate routes are a structural invariant, so not zod's job**: two siblings with the
  same slug is legal per-node but broken per-tree. Schemas validate node shape; code
  validates structure (same boundary as inheritance).

## `src/index.ts` — the composition root

```ts
import { Hono } from "hono";
import linksData from "../links.yaml";
import page404 from "./404.html";
import page410 from "./410.html";
import page425 from "./425.html";
import { load } from "js-yaml";
import { flattenTree, formatDisplayDate, pickTargetIndex, todayIn } from "./lib";
import { linksSchema, type FlatLeaf, type FlatTree } from "./types";
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

// Boot: parse (validates + normalizes) → flatten (resolves inheritance, checks uniqueness).
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
  crashes boot with a zod report naming the exact path/field. The `Node` import disappears —
  parse returns it.
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
- title: Fall 2026
  slug: fall-2026
  locale: en-US          # optional; inherited by children unless overridden (default en-CA)
  children:
    - title: ah1105
      slug: ah1105
      timezone: America/Edmonton   # optional; inherited (default UTC), IANA name
      children:
        - title: midterm exam
          slug: midterm-exam
          publishAt: 2026-10-23    # optional; unlocks ON this date (branch timezone)
          expireAt: 2026-10-25     # optional; dies the day after (branch timezone)
          targets: [...]
```

## Principles (the one-liners)

1. **Validate at the boundary, resolve in the middle, compare at the edge** — zod at boot,
   flattenTree for inheritance/uniqueness, plain string comparison per request.
2. **Schema = what the YAML may say; walk = what the app guarantees** (`Leaf` vs `FlatLeaf`).
3. **Timezone = semantics, locale = presentation** — and the gate formatter's `en-CA` is
   load-bearing, never parameterized.
4. **Fail fast at boot, in this order**: zod shape/refine errors → duplicate-route throw.
5. **parse, don't validate**: `isoDate` doesn't just check dates, it converts them once so
   no downstream code ever sees the duality.

## Checkpoint evidence (must pass)

1. `/fall-2026/ah1105/midterm-exam` → **425**, page shows "October 23, 2026" (en-US display,
   while the gate itself stayed Edmonton-correct).
2. `/fall-2026/ah1105/archived-exam` → **410** (no timezone/locale keys → defaults exercised).
3. `/fall-2026/ah1105/resources` → **302**.
4. Boundary tests (wrangler hot-reloads YAML): `publishAt: <today>` → serves; `expireAt:
   <today>` → serves; `expireAt: <yesterday>` → 410.
5. Typo test: `timezone: America/Edmontn` → dev crashes at boot with the refine message.
6. Duplicate-slug test: two sibling leaves with the same slug → boot throws `Duplicate route`.
7. Malformed YAML test: `slug: "My Slug"` → boot zod error naming the exact path.
