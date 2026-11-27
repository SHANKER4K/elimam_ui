import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

// Run once after `db:push` adds grade_canonical (#16). Idempotent.
// `db:push` creates the column with every row at 'unknown'. The only
// collections seeded so far are the Sahihayn, whose grade is sahih by the
// book itself, so restore exactly those and leave everything else unknown:
// the old 'Sahih' on other books was the column default, not a judgement.
async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle(pool);
  const res = await db.execute(sql`
    UPDATE hadiths SET grade_canonical = 'sahih'
    WHERE grade_canonical = 'unknown'
      AND book_id IN (SELECT id FROM hadith_books
                      WHERE slug IN ('sahih-al-bukhari', 'sahih-muslim'))
  `);
  console.log(`✅ Marked ${res.rowCount} Sahihayn hadiths as sahih`);
  await pool.end();
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
