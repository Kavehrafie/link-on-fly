import { Hono } from "hono";
import linksData from "../links.yaml";
import page404 from "./404.html";
import page410 from "./410.html";
import { load } from "js-yaml";
import { flattenTree, pickTargetIndex, type FlatTree, type Leaf, type Node } from "./lib";
import { getCookie, setCookie } from "hono/cookie";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  png: "image/png",
};

const app = new Hono<{
  Bindings: CloudflareBindings;
  Variables: { leaf: Leaf; path: string };
}>();

const routes: FlatTree = flattenTree(load(linksData) as Node[]);

// Guard middleware: one lookup, then the short-circuits. Returning without
// calling next() ends the request here — the handler never runs.
app.use("*", async (c, next) => {
  const path = c.req.path.endsWith("/") ? c.req.path.slice(0, -1) : c.req.path;
  const leaf = routes.get(path);
  if (!leaf) return c.html(page404, 404);

  // js-yaml turns `expires: 2020-01-01` into a Date instance; yaml strings stay strings.
  let expiresAt: number | undefined;
  if (leaf.expires instanceof Date) expiresAt = leaf.expires.getTime();
  else if (leaf.expires) expiresAt = Date.parse(leaf.expires);
  if (expiresAt !== undefined && expiresAt < Date.now()) return c.html(page410, 410);

  c.set("leaf", leaf);
  c.set("path", path);
  await next();
});

app.get("*", async (c) => {
  const leaf = c.get("leaf");
  const name = `target-of_${c.get("path").replace(/[^a-zA-Z0-9]/g, "_")}`;
  const remembered = getCookie(c, name);

  const parsed = remembered === undefined ? NaN : Number(remembered);
  let index =
    Number.isInteger(parsed) && parsed >= 0 && parsed < leaf.targets.length
      ? parsed
      : undefined;

  if (index === undefined) {
    index = pickTargetIndex(leaf.targets);
    setCookie(c, name, String(index), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      httpOnly: true,
      sameSite: "Lax",
    });
  }

  const target = leaf.targets[index];

  if (target.type === "url") {
    return c.redirect(target.src, 302);
  }

  const obj = await c.env.teaching_resc.get(target.name);
  if (!obj) return c.html(page404, 404);

  const ext = target.name.slice(target.name.lastIndexOf(".") + 1).toLowerCase();
  return c.body(obj.body, 200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Content-Disposition": `attachment; filename="${target.name}"`,
  });
});

export default app;
