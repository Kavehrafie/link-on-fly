type Branch = {
  title: string;
  slug: string;
  description?: string;
  children: (Branch | Leaf)[];
};

type Leaf = {
  title: string;
  slug: string;
  description?: string;
  targets: { type: "r2" | "url"; name: string }[];
};

type Node = Branch | Leaf;
type FlatTree = Map<string, Leaf>;

function flattenTree(tree: Node[], prefix: string = ""): FlatTree {
  let flatTree = new Map<string, Leaf>();

  walkIntoTree(tree, prefix, (leaf) => {
    flatTree.set(`${prefix}${leaf.slug}`, leaf);
  });

  return flatTree;
}

function walkIntoTree(
  tree: Node[],
  prefix: string = "",
  callback: (leaf: Leaf) => void,
) {
  for (const node of tree) {
    if ("children" in node) {
      walkIntoTree(node.children, `${prefix}${node.slug}/`, callback);
    } else {
      callback(node);
    }
  }
}
