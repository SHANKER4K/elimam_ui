import { expect, test } from "bun:test";
import { citationsToPlainText } from "./citation";

test("citationsToPlainText strips citation tags into clean Arabic quotes", () => {
  const input =
    'قال تعالى: <quran id="2:255" surah="البقرة" ayah_number="255" match="exact">لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ</quran> وقال: <hadith id="bukhari:1.0" book="bukhari" grade="صحيح" match="exact">إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ</hadith> وقال: <book id="0:12:3" book_name="الزهد لأحمد بن حنبل" category_name="الرقائق" match="exact">نص الكتاب</book>';
  expect(citationsToPlainText(input)).toBe(
    "قال تعالى: «لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ» [البقرة: 255] وقال: «إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ» [صحيح البخاري، رقم 1] وقال: «نص الكتاب» [الزهد لأحمد بن حنبل]",
  );
});

test("citationsToPlainText leaves plain prose untouched", () => {
  const prose = "نص عادي بدون أي وسوم";
  expect(citationsToPlainText(prose)).toBe(prose);
});
