import { Hono } from "hono";
import linksData from "../links.yaml";
import { load } from "js-yaml";
import { flattenTree, pickTargetIndex, todayIn } from "./lib";
import { linksSchema, type FlatTree, type Leaf } from "./schema";
import { getCookie, setCookie } from "hono/cookie";
import { Page404, Page410, Page425 } from "./view";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  png: "image/png",
};

// Used where no leaf exists (404s), so there's nothing to inherit from.
const DEFAULT_LOCALE = "en-CA";

const app = new Hono<{
  Bindings: CloudflareBindings;
  Variables: { leaf: Leaf; path: string };
}>();

const routes: FlatTree = flattenTree(linksSchema.parse(load(linksData)));

// Guard middleware: one lookup, then the short-circuits. Returning without
// calling next() ends the request here — the handler never runs.
app.use("*", async (c, next) => {
  const path = c.req.path.endsWith("/") ? c.req.path.slice(0, -1) : c.req.path;
  const leaf = routes.get(path);
  if (!leaf) return c.html(Page404({ locale: DEFAULT_LOCALE }), 404);

  const today = todayIn(leaf.timezone)
  const publishAt = leaf.publishAt
  const expireAt = leaf.expireAt


  if (expireAt !== undefined && expireAt < today) return c.html(Page410({ locale: leaf.locale, expireAt }), 410);
  if (publishAt !== undefined && publishAt > today) return c.html(Page425({ locale: leaf.locale, publishAt }), 425);


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
  if (!obj) return c.html(Page404({ locale: DEFAULT_LOCALE }), 404);

  const ext = target.name.slice(target.name.lastIndexOf(".") + 1).toLowerCase();
  return c.body(obj.body, 200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Content-Disposition": `attachment; filename="${target.name}"`,
  });
});

export default app;
