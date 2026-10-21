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


export {
  flattenTree,
  type Branch,
  type Leaf,
  type Node,
  type FlatTree,
}