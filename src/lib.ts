type Branch = {
  title: string;
  slug: string;
  description?: string;
  children: (Branch | Leaf)[];
};

type Target = {type: "r2", name: string} | {type: "url", src: string};

type Leaf = {
  title: string;
  slug: string;
  description?: string;
  expires?: Date | string; // js-yaml parses ISO dates into Date instances — handle both
  targets: Target[];
};


type Node = Branch | Leaf;
type FlatTree = Map<string, Leaf>;

function flattenTree(tree: Node[], prefix: string = ""): FlatTree {
  let flatTree = new Map<string, Leaf>();

  walkIntoTree(tree, "/", (leaf, prefix) => {
    flatTree.set(`${prefix}${leaf.slug}`, leaf);
  });

  return flatTree;
}

function walkIntoTree(
  tree: Node[],
  prefix: string = "",
  callback: (leaf: Leaf, prefix: string) => void,
) {
  for (const node of tree) {
    if ("children" in node) {
      walkIntoTree(node.children, prefix + node.slug + '/', callback);
    } else {
      callback(node, prefix);
    }
  }
}

function pickTargetIndex(targets: Target[], rng: () => number = Math.random): number {
  if (targets.length === 0) {
    throw new Error("No targets available to pick from.");
  }
  return Math.floor(rng() * targets.length);
}

export {
  pickTargetIndex,
  type Target,
  flattenTree,
  type Branch,
  type Leaf,
  type Node,
  type FlatTree,
}