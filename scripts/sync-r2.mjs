#!/usr/bin/env node
// Push every file in uploads/ into the R2 bucket bound as teaching_resc.
//   bun run sync:r2              → local emulation (what `wrangler dev` reads)
//   bun run sync:r2 -- --remote  → the real bucket (needs `wrangler login`)
// Keys are the file basenames — they must match the `name:` fields in links.yaml.

import { readdirSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const BUCKET = "teaching-resc"; // the bucket NAME (CLI wants this), not the binding
const remote = process.argv.includes("--remote");

const uploadsDir = fileURLToPath(new URL("../uploads/", import.meta.url));
const wranglerBin = fileURLToPath(new URL("../node_modules/.bin/wrangler", import.meta.url));

const MIME = {
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

const files = readdirSync(uploadsDir).filter((f) => statSync(join(uploadsDir, f)).isFile());
if (files.length === 0) {
  console.log("uploads/ is empty — nothing to sync.");
  process.exit(0);
}

let failed = 0;
for (const file of files) {
  const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
  const args = [
    "r2", "object", "put", `${BUCKET}/${basename(file)}`,
    "--file", join(uploadsDir, file),
    "--content-type", type,
  ];
  if (!remote) args.push("--local");

  console.log(`→ ${BUCKET}/${basename(file)} (${type}${remote ? ", remote" : ", local"})`);
  const result = spawnSync(wranglerBin, args, { stdio: "inherit" });
  if (result.status !== 0) failed++;
}

console.log(failed === 0 ? `Synced ${files.length} object(s).` : `${failed} upload(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
