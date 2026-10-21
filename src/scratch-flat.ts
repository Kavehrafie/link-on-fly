import { load } from 'js-yaml';
import {readFileSync} from "node:fs"
import {flattenTree, type Node} from './lib.ts'

try {
  const yamlData = readFileSync(new URL('../links.yaml', import.meta.url), 'utf8');
  const data = load(yamlData) as Node[];
  const flatdata = flattenTree(data);
  console.log("Loaded links.yaml successfully:", flatdata);
} catch (e) {
  throw new Error("Failed to load links.yaml: " + e)
}


