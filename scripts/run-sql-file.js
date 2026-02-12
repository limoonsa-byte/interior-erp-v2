/**
 * sql/run_in_sql_editor.sql 내용을 현재 POSTGRES_URL DB에 실행합니다.
 * 사용: node scripts/run-sql-file.js
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function loadEnvFile(filename) {
  const envPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return false;
  try {
    const content = fs.readFileSync(envPath, "utf8");
    content.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (m) {
        const key = m[1].trim();
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
      }
    });
    return true;
  } catch (_) {
    return false;
  }
}
loadEnvFile(".env.local") || loadEnvFile(".env");
if (process.env.DATABASE_URL && !process.env.POSTGRES_URL) process.env.POSTGRES_URL = process.env.DATABASE_URL;

const sqlPath = path.resolve(process.cwd(), "sql", "run_in_sql_editor.sql");
const raw = fs.readFileSync(sqlPath, "utf8");
const statements = raw
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

async function run() {
  if (!process.env.POSTGRES_URL) {
    console.error("POSTGRES_URL 없음. .env.local 또는 .env 설정 후 실행하세요.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.POSTGRES_URL });
  try {
    await client.connect();
    for (let i = 0; i < statements.length; i++) {
      const q = statements[i] + ";";
      await client.query(q);
      console.log("[run-sql] OK:", q.slice(0, 60).replace(/\s+/g, " ") + "...");
    }
    console.log("[run-sql] 완료. 총", statements.length, "개 문 실행");
  } catch (err) {
    console.error("[run-sql] 실패:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
  process.exit(0);
}
run();
