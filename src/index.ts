import { Hono } from "hono";
import linksData from "../links.yaml";
import page404 from "./404.html";
import { load } from "js-yaml";
import { flattenTree, type FlatTree, type Node } from "./lib";

const app = new Hono();

const routes: FlatTree = flattenTree(load(linksData) as Node[]);

app.get("*", (c) => {
  const path = c.req.path.endsWith("/")
    ? c.req.path.slice(0, -1)
    : c.req.path;

  const leaf = routes.get(path);

  if (!leaf) return c.html(page404, 404);

  const target = leaf?.targets[Math.floor(Math.random() * leaf.targets.length)];

  if (target?.type === "url") {
    return c.redirect(target.src, 302);
  }

  return c.text("R2 arrives in Lesson 3", 501);
});

export default app;
