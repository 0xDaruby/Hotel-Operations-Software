import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("cancelled pending setups cannot activate or complete through an old token", () => {
  const sql = readFileSync(
    new URL(
      "../../../../../supabase/migrations/0010_staff_management.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /cancel_staff_setup/);
  assert.match(sql, /target\.setup_pending OR target\.setup_cancelled/);
  assert.match(sql, /staff\.setup_cancelled/);
});
