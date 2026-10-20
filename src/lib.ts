/**
 * Turns a tree structure into an array of objects.
 * @param tree Object tree with object entries attached by their IDs as keys.
 * @returns Array of objects entries with their IDs embedded in their structure
 * @example
 * // given a tree:
 * {
 *   'a': {
 *     label: 'A', id: 'a', children: {
 *       'a|b': {
 *         label: 'B', id: 'a|b', children: {
 *           'a|b|c': { label: 'C', id: 'a|b|c' },
 *           'a|b|d': { label: 'D', id: 'a|b|d' }
 *         }
 *       },
 *       'a|x': { label: 'X', id: 'a|x' }
 *     }
 *   },
 *   't': { label: 'T', id: 't' }
 * }
 *
 * // returns:
 * [
 *   {
 *     label: 'A', id: 'a', children: [
 *       {
 *         label: 'B', id: 'a|b', children: [
 *           { label: 'C', id: 'a|b|c' },
 *           { label: 'D', id: 'a|b|d' }
 *         ]
 *       },
 *       { label: 'X', id: 'a|x' }
 *     ]
 *   },
 *   { label: 'T', id: 't' }
 * ]
 */
function flattenTree(tree) {
  let flatTree = [];
  if (tree) {
    for (let key in tree) {
      const node = tree[key];
      node.id = key;
      if (node.children) {
        node.children = flattenTree(node.children);
      }
      flatTree.push(node);
    }
  }
  return flatTree;
}