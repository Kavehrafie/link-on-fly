import type { CrownNode, FlatLeaf, FlatTree, Leaf, Node, Target } from "./schema";

const gateFormatters = new Map<string, Intl.DateTimeFormat>();

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

function formatDisplayDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC", dateStyle: "long"
  }).format
    (new Date(iso))
}

interface WalkIntoOpts {
  prefix: string;
  onLeaf: (leaf: Leaf, prefix: string) => void
}

function walkIntoTree(
  tree: Node[],
  opts: WalkIntoOpts
): void {
  for (const node of tree) {
    if ("children" in node) {
      walkIntoTree(node.children, { ...opts, prefix: opts.prefix + node.slug + "/" })
    }
    else {
      opts.onLeaf(node, opts.prefix)
    }
  }
}

function flattenTree(tree: CrownNode[]): FlatTree {
  let flatTree = new Map<string, FlatLeaf>();

  for (const crown of tree) {
    const resolved = {
      timezone: crown.timezone ?? "UTC",
      locale: crown.locale ?? "en-CA",
    }

    const zoneDeclared = crown.timezone !== undefined;

    const put = (leaf: Leaf, prefix: string) => {
      const key = prefix + leaf.slug
      if (flatTree.has(key)) throw new Error(`Duplicate route: ${key}`)
      if (!zoneDeclared && (leaf.publishAt !== undefined || leaf.expireAt !== undefined)) {
        throw new Error(`${key}: publish window but no timezone - declare timezone: on the crown`)
      }
      flatTree.set(key, { ...leaf, ...resolved })
    }

    if ("children" in crown) {
      walkIntoTree(crown.children, { prefix: `/${crown.slug}/`, onLeaf: put })
    } else {
      put(crown, "/")
    }
  }
  return flatTree;
}

function pickTargetIndex(targets: Target[], rng: () => number = Math.random): number {
  if (targets.length === 0) {
    throw new Error("No targets available to pick from.");
  }
  return Math.floor(rng() * targets.length);
}


export {
  pickTargetIndex,
  flattenTree,
  formatDisplayDate,
  todayIn
}
