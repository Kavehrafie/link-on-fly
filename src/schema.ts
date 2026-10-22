// The links.yaml schema. Everything here describes what the YAML *may* say;
// the resolved post-flatten shapes live at the bottom.
import z from "zod";


function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz })
    return true
  } catch {
    return false
  }
}


type Branch = {
  title: string;
  slug: string;
  description?: string;
  timezone?: string; // IANA name, inherited by children unless overridden
  local?: string;
  children: (Branch | Leaf)[];
};

// Accepts js-yaml's Date instances and quoted strings; normalizes both to a
// plain "YYYY-MM-DD" string. The refine guards the zero-padded shape that the
// middleware's lexicographic date comparison relies on.
const isoDate = z
  .union([z.date(), z.string()])
  .transform((d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d))
  .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s), "must be a YYYY-MM-DD date");

const targetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("r2"), name: z.string() }),
  z.object({ type: z.literal("url"), src: z.string() })
])

const leafSchema = z.object({
  title: z.string(),
  slug: z.string().regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "lowercase letters, digits, hyphens"
  ),
  description: z.string().optional(),
  expireAt: isoDate.optional(),
  publishAt: isoDate.optional(),
  timezone: z.string().optional(),
  targets: z.array(targetSchema)
})

// Runtime recursion needs z.lazy (zod builds the object eagerly); the
// ZodType<Branch> annotation breaks the compile-time cycle — TS can't infer a
// const that references itself in its own initializer.
const branchSchema: z.ZodType<Branch> = z.object({
  title: z.string(),
  slug: z.string().regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "lowercase letters, digits, hyphens"
  ),
  description: z.string().optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  children: z.array(z.lazy(() => nodeSchema)),
});

const nodeSchema = z.union([leafSchema, branchSchema])

// The whole links.yaml document: a list of nodes at the top level.
const linksSchema = z.array(nodeSchema);

export { linksSchema };

type Leaf = z.infer<typeof leafSchema>
type Target = z.infer<typeof targetSchema>
type Node = z.infer<typeof nodeSchema>

// Resolved by flattenTree: timezone is inherited-and-defaulted, so it's
// guaranteed present (and valid) on everything stored in the tree.
type FlatLeaf = Leaf & { timezone: string };
type FlatTree = Map<string, FlatLeaf>;

export type {
  Branch,
  Leaf,
  Target,
  Node,
  FlatLeaf,
  FlatTree,
};
