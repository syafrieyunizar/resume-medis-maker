const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync("supabase_migration.sql", "utf8");
const edge = fs.readFileSync("supabase/functions/knowledge-admin/index.ts", "utf8");

assert.match(migration, /create table if not exists public\.app_usage_logs/);
assert.ok(edge.indexOf('assertAdmin(payload);') < edge.indexOf('action === "usage_logs"'));
for (const forbidden of ["api_key text", "prompt text", "response text", "patient"]) {
  const table = migration.match(/create table if not exists public\.app_usage_logs \([\s\S]*?\n\);/)?.[0] || "";
  assert.ok(!table.includes(forbidden), `Kolom sensitif terdeteksi: ${forbidden}`);
}
console.log("usage logging security check passed");