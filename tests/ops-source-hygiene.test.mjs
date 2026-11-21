import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

const files = ["apps/flame-chick-pos/index.html", "apps/flame-chick-rider/index.html"];
const source = files.map((file) => ({ file, html: readFileSync(file, "utf8") }));

test("POS and Rider source use Flame Chick identifiers only", () => {
  const all = source.map((x) => x.html).join("\n");
  const retiredBrand = ["Pizza", "Bite"].join(" ");
  const retiredGlobal = ["H", "F", "P"].join("");
  assert.equal(all.toLowerCase().includes(retiredBrand.toLowerCase()), false);
  assert.equal(new RegExp("\\b" + retiredGlobal + "\\b", "i").test(all), false);
  assert.equal(/service_role|sb_secret_/i.test(all), false);
});

test("POS and Rider inline JavaScript parses", () => {
  for (const { file, html } of source) {
    const chunks = html.split("<script").slice(1);
    let index = 0;
    for (const chunk of chunks) {
      const tagEnd = chunk.indexOf(">");
      if (tagEnd < 0) continue;
      const attrs = chunk.slice(0, tagEnd);
      if (attrs.toLowerCase().includes("src=")) continue;
      const close = chunk.indexOf("</script>", tagEnd + 1);
      if (close < 0) continue;
      const code = chunk.slice(tagEnd + 1, close).trim();
      if (code) new vm.Script(code, { filename: file + "-inline-" + index++ + ".js" });
    }
    assert.ok(index > 0, "No inline JavaScript checked in " + file);
  }
});

test("rider Realtime channel uses the Flame Chick namespace", () => {
  assert.match(source[1].html, /flame-chick-rider-ops-/);
});
