import { load } from 'js-yaml';
import { readFileSync } from "node:fs"
import { flattenTree } from './lib.ts'
import type { Node } from './schema.js'

try {
  const yamlData = readFileSync(new URL('../links.yaml', import.meta.url), 'utf8');
  const data = load(yamlData) as Node[];
  const flatdata = flattenTree(data);
  console.log("Loaded links.yaml successfully:", flatdata);
} catch (e) {
  throw new Error("Failed to load links.yaml: " + e)
}


