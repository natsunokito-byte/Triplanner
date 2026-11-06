import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

type Tree = { [k: string]: string | Tree };
const load = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), "utf8")) as Tree;
const flat = (t: Tree, p = ""): Record<string, string> =>
  Object.entries(t).reduce((o, [k, v]) => (typeof v === "string" ? { ...o, [p + k]: v } : { ...o, ...flat(v, `${p}${k}.`) }), {});

const zh = flat(load("zh-TW"));
const en = flat(load("en"));
const vars = (s: string) => [...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).sort().join(",");

test("zh-TW and en have exactly the same keys", () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
});

test("placeholders match between locales", () => {
  for (const k of Object.keys(zh)) assert.equal(vars(zh[k]), vars(en[k] ?? ""), k);
});

test("no empty strings, and English values contain no CJK characters", () => {
  for (const [k, v] of Object.entries(en)) {
    assert.ok(v.trim().length > 0, `empty en: ${k}`);
    assert.ok(!/[㐀-鿿]/.test(v), `CJK in en: ${k} = ${v}`);
  }
  for (const [k, v] of Object.entries(zh)) assert.ok(v.trim().length > 0, `empty zh: ${k}`);
});
