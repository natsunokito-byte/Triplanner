import test from "node:test";
import assert from "node:assert/strict";
import { formatPlaceLabel } from "../src/lib/geo";

test("Taiwan is shown as a country, with no 'province' level (zh-TW and en)", () => {
  const r = { name: "台北市", admin1: "臺灣省 or 台灣省", country: "台湾", country_code: "TW" };
  assert.equal(formatPlaceLabel(r, "zh-TW"), "台北市, 台灣");
  assert.equal(formatPlaceLabel({ ...r, name: "Taipei", admin1: "Taiwan Province", country: "Taiwan" }, "en"), "Taipei, Taiwan");
});

test("other places keep their region; alternates keep the first", () => {
  assert.equal(formatPlaceLabel({ name: "Tokyo", admin1: "Tokyo", country: "Japan", country_code: "JP" }, "en"), "Tokyo, Japan");
  assert.equal(formatPlaceLabel({ name: "Kyoto", admin1: "Kyoto", country: "x", country_code: "JP" }, "zh-TW"), "Kyoto, 日本");
  assert.equal(formatPlaceLabel({ name: "A", admin1: "B or C", country: "Z" }, "en"), "A, B, Z");
});
