import type { FlatLeaf, FlatTree, Leaf, Node, Target } from "./schema";

const gateFormatters = new Map<string, Intl.DateTimeFormat>();


function flattenTree(tree: Node[], prefix: string = ""): FlatTree {
  let flatTree = new Map<string, FlatLeaf>();

  walkIntoTree(
    tree,
    {
      tz: "UTC",
      prefix: "/",
      callback: (leaf, prefix, tz) => {
        flatTree.set(`${prefix}${leaf.slug}`, { ...leaf, timezone: tz });
      }
    }
  );

  return flatTree;
}

interface WalkIntoOpts {
  tz: string;
  locale?: string;
  prefix: string;
  onLeaf: (leaf: Leaf, prefix: string,
    resolved: {
      timezone: string;
      locale: string;
    }) => void
}

function walkIntoTree(
  tree: Node[],
  opts: WalkIntoOpts
): void {
  for (const node of tree) {
    let tz = node?.timezone ?? opts.tz
    const locale = node?.locale ?? opts.locale;

    if ("children" in node) {
      walkIntoTree(node.children,
        {
          prefix: opts.prefix + node.slug + '/',
          tz,
          callback: opts.callback
        })
    } else {
      opts.callback(node, opts.prefix ?? "", tz || "UTC");
    }
  }
}

function pickTargetIndex(targets: Target[], rng: () => number = Math.random): number {
  if (targets.length === 0) {
    throw new Error("No targets available to pick from.");
  }
  return Math.floor(rng() * targets.length);
}

function todayIn(tz: string): string {
  let fmt = gateFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    gateFormatters.set(tz, fmt);
  }
  return fmt.format(new Date())
}

function formatDisplayDate(iso: string, locale: string) : string {
 return new Intl.DateTimeFormat(locale, {
  timeZone: "UTC", dateStyle: "long"}).format
(new Date(iso))
}

export {
  pickTargetIndex,
  flattenTree,
  todayIn
}
