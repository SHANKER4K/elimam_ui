import { expect, test } from "bun:test";
import { normalizeGrade } from "./grade";

test("normalizeGrade maps corpus labels to canonical grades", () => {
  const cases: [string | null | undefined, string][] = [
    [null, "unknown"],
    ["", "unknown"],
    ["لا أدري", "unknown"],
    ["sahih", "sahih"], // already canonical
    ["Sahih", "sahih"], // legacy enum
    ["Dhaeef", "daif"], // legacy enum
    ["Sahih Isnaad", "sahih"],
    ["Sahih Maqtu", "sahih"],
    ["Hasan Sahih", "hasan"], // never upgraded past the weaker term
    ["Hasan", "hasan"],
    ["Da'if", "daif"],
    ["Munkar", "daif"],
    ["Shadh", "daif"],
    ["Very Daif", "very_daif"],
    ["Daif Jiddan", "very_daif"],
    ["Mawdu", "mawdu"],
    ["صحيح", "sahih"],
    ["حسن صحيح", "hasan"],
    ["ضعيفٌ جداً", "very_daif"], // tashkeel + tanween
    ["موضوع", "mawdu"],
  ];
  for (const [raw, want] of cases) expect([raw, normalizeGrade(raw)]).toEqual([raw, want]);
});
