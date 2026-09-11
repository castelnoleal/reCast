import test from "node:test";
import assert from "node:assert/strict";
import { detectSwallowedElement, hasUnquotedLessThan } from "../packages/core/dist/index.js";

test("detects a tag that swallows a following element", () => {
  assert.equal(hasUnquotedLessThan(' class="browser-img" src="a.png" <div class="hl"'), true);
  assert.deepEqual(detectSwallowedElement("img", ' class="browser-img" src="a.png" <div class="hl"'), {
    code: "unclosed_tag_swallowed_element",
    severity: "error",
    message: "<img> is missing its closing `>` before the next `<`.",
  });
});

test("allows a less-than sign inside a quoted attribute", () => {
  assert.equal(hasUnquotedLessThan(' data-expr="x < y"'), false);
  assert.equal(detectSwallowedElement("div", ' data-expr="x < y"'), null);
});

test("allows a normal tag", () => {
  assert.equal(hasUnquotedLessThan(' src="a.png"'), false);
});
