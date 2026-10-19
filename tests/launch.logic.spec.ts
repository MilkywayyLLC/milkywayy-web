import { expect, test } from "@playwright/test";
import { realFirst, REAL_REVIEWS_NEEDED } from "@/lib/data/sample";

/** Samples step aside by themselves once real content exists (owner, 4 Oct 2026). */
test("a list shows its samples only until it has enough real items", () => {
  type Item = { id: string; sample?: boolean };
  const s = (id: string): Item => ({ id, sample: true });
  const r = (id: string): Item => ({ id });
  expect(realFirst([s("a"), s("b")]).map((x) => x.id)).toEqual(["a", "b"]);
  expect(realFirst([s("a"), r("b"), s("c")]).map((x) => x.id)).toEqual(["b"]);
  // Reviews: the samples (and their "Sample text" label) go at 3 real ones.
  expect(REAL_REVIEWS_NEEDED).toBe(3);
  const two = [s("x"), r("1"), r("2")];
  expect(realFirst(two, REAL_REVIEWS_NEEDED)).toHaveLength(3);
  expect(realFirst([...two, r("3")], REAL_REVIEWS_NEEDED).map((x) => x.id)).toEqual([
    "1",
    "2",
    "3",
  ]);
  expect(realFirst([])).toEqual([]);
});
