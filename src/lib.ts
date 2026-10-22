import type { FlatLeaf, FlatTree, Leaf, Node, Target } from "./schema";

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
  prefix: string;
  callback: (leaf: Leaf, prefix: string, tz: string) => void
}

function walkIntoTree(
  tree: Node[],
  opts: WalkIntoOpts
) {
  for (const node of tree) {
    let tz = node?.timezone ?? opts.tz

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

function todayIn(tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date())
}


export {
  pickTargetIndex,
  flattenTree,
  todayIn
}
