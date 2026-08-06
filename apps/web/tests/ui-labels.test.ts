import assert from "node:assert/strict";
import test from "node:test";

import { formatCzechCount } from "../lib/ui-labels";

const teacherForms = ["učitel", "učitelé", "učitelů"] as const;
const classForms = ["třída", "třídy", "tříd"] as const;

test("formatCzechCount uses the correct Czech form for school counts", () => {
  assert.equal(formatCzechCount(0, teacherForms), "0 učitelů");
  assert.equal(formatCzechCount(1, teacherForms), "1 učitel");
  assert.equal(formatCzechCount(2, teacherForms), "2 učitelé");
  assert.equal(formatCzechCount(4, teacherForms), "4 učitelé");
  assert.equal(formatCzechCount(5, teacherForms), "5 učitelů");
  assert.equal(formatCzechCount(21, teacherForms), "21 učitelů");

  assert.equal(formatCzechCount(1, classForms), "1 třída");
  assert.equal(formatCzechCount(3, classForms), "3 třídy");
  assert.equal(formatCzechCount(13, classForms), "13 tříd");
});
