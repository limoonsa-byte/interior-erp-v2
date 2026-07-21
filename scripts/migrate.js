/**
 * 배포(빌드) 시 자동 실행되는 DB 마이그레이션.
 * Vercel 빌드 시 환경변수 POSTGRES_URL 등이 있으면 실행됩니다.
 * 로컬에서는 .env.local 을 자동으로 읽습니다.
 */
const fs = require("fs");
const path = require("path");

// 로컬 실행 시 .env.local 또는 .env 로드 (POSTGRES_URL 등)
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
if (loadEnvFile(".env.local")) console.log("[migrate] .env.local 로드함");
else if (loadEnvFile(".env")) console.log("[migrate] .env 로드함");

// Vercel Postgres는 POSTGRES_URL 사용. DATABASE_URL만 있으면 그대로 사용
if (!process.env.POSTGRES_URL && process.env.DATABASE_URL) {
  process.env.POSTGRES_URL = process.env.DATABASE_URL;
}

const { sql } = require("@vercel/postgres");

async function migrate() {
  // POSTGRES_URL이 없으면 마이그레이션 건너뛰기
  if (!process.env.POSTGRES_URL) {
    console.log("[migrate] POSTGRES_URL이 없어서 마이그레이션을 건너뜁니다.");
    console.log("[migrate] .env.local 또는 .env에 POSTGRES_URL= 또는 DATABASE_URL= 을 넣은 뒤 다시 실행하세요.");
    console.log("[migrate] 로컬: node scripts/migrate.js");
    process.exit(0);
  }

  try {
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS consulted_at TEXT`;
    console.log("[migrate] consulted_at OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS scope TEXT`;
    console.log("[migrate] scope OK");
    await sql`
      CREATE TABLE IF NOT EXISTS company_pics (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        UNIQUE(company_id, name)
      )
    `;
    console.log("[migrate] company_pics OK");
    await sql`ALTER TABLE company_pics ADD COLUMN IF NOT EXISTS phone TEXT`;
    console.log("[migrate] company_pics phone OK");
    await sql`ALTER TABLE company_pics ADD COLUMN IF NOT EXISTS employee_code TEXT`;
    await sql`ALTER TABLE company_pics ADD COLUMN IF NOT EXISTS password_hash TEXT`;
    await sql`ALTER TABLE company_pics ADD COLUMN IF NOT EXISTS position TEXT`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS company_pics_company_employee_code ON company_pics (company_id, employee_code) WHERE (employee_code IS NOT NULL AND employee_code <> '')`;
    console.log("[migrate] company_pics employee_code, position OK");
    await sql`
      CREATE TABLE IF NOT EXISTS company_admin_pin (
        company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        pin TEXT NOT NULL
      )
    `;
    console.log("[migrate] company_admin_pin OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS budget TEXT`;
    console.log("[migrate] budget OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS completion_year TEXT`;
    console.log("[migrate] completion_year OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS site_measurement_at TEXT`;
    console.log("[migrate] site_measurement_at OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS estimate_meeting_at TEXT`;
    console.log("[migrate] estimate_meeting_at OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS material_meeting_at TEXT`;
    console.log("[migrate] material_meeting_at OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS contract_meeting_at TEXT`;
    console.log("[migrate] contract_meeting_at OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS design_meeting_at TEXT`;
    console.log("[migrate] design_meeting_at OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS consulted_done BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS site_measurement_done BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS estimate_meeting_done BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS material_meeting_done BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS material_ordered_at TEXT`;
    console.log("[migrate] material_ordered_at OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS contract_meeting_done BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS design_meeting_done BOOLEAN DEFAULT false`;
    console.log("[migrate] date_done flags OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS construction_start_at TEXT`;
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS move_in_at TEXT`;
    console.log("[migrate] construction_start_at, move_in_at OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS schedule_phases TEXT`;
    console.log("[migrate] schedule_phases OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS schedule_list_color TEXT`;
    console.log("[migrate] schedule_list_color OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS schedule_memo TEXT`;
    console.log("[migrate] schedule_memo OK");
    await sql`ALTER TABLE consultations DROP COLUMN IF EXISTS region`;
    console.log("[migrate] region 컬럼 제거 OK");
    await sql`
      CREATE TABLE IF NOT EXISTS estimates (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        consultation_id INT REFERENCES consultations(id) ON DELETE CASCADE,
        customer_name TEXT,
        contact TEXT,
        address TEXT,
        title TEXT,
        estimate_date DATE,
        note TEXT,
        items TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log("[migrate] estimates OK");
    await sql`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS process_order TEXT`;
    await sql`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS overhead_percent INT DEFAULT 5`;
    await sql`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS profit_percent INT DEFAULT 10`;
    await sql`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS pic_name TEXT`;
    console.log("[migrate] estimates process_order OK");
    await sql`
      CREATE TABLE IF NOT EXISTS env_backup (
        id INT PRIMARY KEY DEFAULT 1,
        content TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`INSERT INTO env_backup (id, content) VALUES (1, '') ON CONFLICT (id) DO NOTHING`;
    console.log("[migrate] env_backup OK");
    await sql`
      CREATE TABLE IF NOT EXISTS company_custom_menu (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        href TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0
      )
    `;
    console.log("[migrate] company_custom_menu OK");
    await sql`
      CREATE TABLE IF NOT EXISTS company_estimate_templates (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        items TEXT NOT NULL DEFAULT '[]',
        process_order TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log("[migrate] company_estimate_templates OK");
    await sql`ALTER TABLE company_estimate_templates ADD COLUMN IF NOT EXISTS note TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_master BOOLEAN NOT NULL DEFAULT false`;
    console.log("[migrate] companies.is_master OK");
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_path TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS stamp_path TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_data TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS stamp_data TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS contractor_address TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS contractor_reg_no TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_email TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_host TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_port TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_user TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_pass TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_oauth_provider TEXT`;
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS smtp_oauth_refresh_token TEXT`;
    console.log("[migrate] companies logo_path, stamp_path, contractor, email, smtp OK");
    await sql`
      UPDATE companies SET is_master = true
      WHERE id = (SELECT id FROM companies ORDER BY id ASC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM companies WHERE is_master = true)
    `;
    console.log("[migrate] 마스터 미지정 시 첫 회사 마스터 지정 OK");
    await sql`
      CREATE TABLE IF NOT EXISTS master_default_estimate_templates (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        items TEXT NOT NULL DEFAULT '[]',
        process_order TEXT,
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log("[migrate] master_default_estimate_templates OK");
    await sql`ALTER TABLE master_default_estimate_templates ADD COLUMN IF NOT EXISTS note TEXT`;
    await sql`
      CREATE TABLE IF NOT EXISTS company_workers (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phone TEXT,
        role TEXT,
        memo TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log("[migrate] company_workers OK");
    await sql`ALTER TABLE company_workers ADD COLUMN IF NOT EXISTS rating SMALLINT`;
    console.log("[migrate] company_workers.rating OK");
    await sql`
      CREATE TABLE IF NOT EXISTS master_default_order_items (
        id INT PRIMARY KEY DEFAULT 1,
        items_json TEXT NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT single_row CHECK (id = 1)
      )
    `;
    await sql`INSERT INTO master_default_order_items (id, items_json) VALUES (1, '{}') ON CONFLICT (id) DO NOTHING`;
    await sql`ALTER TABLE master_default_order_items ADD COLUMN IF NOT EXISTS item_names_json TEXT NOT NULL DEFAULT '[]'`;
    console.log("[migrate] master_default_order_items OK");
    await sql`
      CREATE TABLE IF NOT EXISTS master_order_template (
        id INT PRIMARY KEY DEFAULT 1,
        file_content_base64 TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT single_row_template CHECK (id = 1)
      )
    `;
    await sql`ALTER TABLE master_order_template ADD COLUMN IF NOT EXISTS file_content_base64 TEXT`;
    console.log("[migrate] master_order_template OK");
    await sql`
      CREATE TABLE IF NOT EXISTS company_work_logs (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        log_date DATE NOT NULL,
        estimate_id INT REFERENCES estimates(id) ON DELETE SET NULL,
        pic_id INT REFERENCES company_pics(id) ON DELETE SET NULL,
        content TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE company_work_logs ADD COLUMN IF NOT EXISTS expenses TEXT`;
    console.log("[migrate] company_work_logs OK");
    await sql`
      CREATE TABLE IF NOT EXISTS estimate_settlements (
        estimate_id INT PRIMARY KEY REFERENCES estimates(id) ON DELETE CASCADE,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        items TEXT NOT NULL DEFAULT '[]',
        settled_at DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE estimate_settlements ADD COLUMN IF NOT EXISTS customer_payment TEXT`;
    await sql`ALTER TABLE estimate_settlements ADD COLUMN IF NOT EXISTS payment_approval_data TEXT`;
    await sql`
      CREATE TABLE IF NOT EXISTS estimate_payment_approvals (
        estimate_id INT PRIMARY KEY REFERENCES estimates(id) ON DELETE CASCADE,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        data_json TEXT NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    try {
      await sql`
        INSERT INTO estimate_payment_approvals (estimate_id, company_id, data_json, updated_at)
        SELECT s.estimate_id, s.company_id, s.payment_approval_data, NOW()
        FROM estimate_settlements s
        WHERE s.payment_approval_data IS NOT NULL
          AND trim(s.payment_approval_data) <> ''
          AND trim(s.payment_approval_data) <> '{}'
        ON CONFLICT (estimate_id) DO NOTHING
      `;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/estimate_payment_approvals|payment_approval_data/i.test(msg)) throw e;
    }
    console.log("[migrate] estimate_settlements OK");
    await sql`
      CREATE TABLE IF NOT EXISTS company_chat_messages (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        consultation_id INT REFERENCES consultations(id) ON DELETE CASCADE,
        estimate_id INT REFERENCES estimates(id) ON DELETE CASCADE,
        sender_name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE company_chat_messages ADD COLUMN IF NOT EXISTS consultation_id INT REFERENCES consultations(id) ON DELETE CASCADE`;
    await sql`ALTER TABLE company_chat_messages ADD COLUMN IF NOT EXISTS estimate_id INT REFERENCES estimates(id) ON DELETE CASCADE`;
    console.log("[migrate] company_chat_messages OK");
    await sql`
      CREATE TABLE IF NOT EXISTS chat_push_subscriptions (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        estimate_id INT REFERENCES estimates(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        subscriber_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(endpoint)
      )
    `;
    await sql`ALTER TABLE chat_push_subscriptions ADD COLUMN IF NOT EXISTS subscriber_name TEXT`;
    console.log("[migrate] chat_push_subscriptions OK");
    await sql`
      CREATE TABLE IF NOT EXISTS contracts (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        consultation_id INT REFERENCES consultations(id) ON DELETE CASCADE,
        estimate_id INT REFERENCES estimates(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        customer_name TEXT NOT NULL DEFAULT '',
        contact TEXT NOT NULL DEFAULT '',
        signer_email TEXT,
        document_path TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        sign_token TEXT UNIQUE,
        signed_at TIMESTAMPTZ,
        signer_name TEXT,
        signature_data TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log("[migrate] contracts OK");
    await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS body TEXT`;
    console.log("[migrate] contracts.body OK");
    await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS details TEXT`;
    console.log("[migrate] contracts.details OK");
    await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signer_address TEXT`;
    await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signer_resident_number TEXT`;
    await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS document_data TEXT`;
    await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS body_margins TEXT`;
    console.log("[migrate] contracts.signer_address, signer_resident_number, document_data, body_margins OK");
    await sql`
      CREATE TABLE IF NOT EXISTS master_contract_template (
        id INT PRIMARY KEY DEFAULT 1,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT single_row CHECK (id = 1)
      )
    `;
    await sql`INSERT INTO master_contract_template (id, title, body) VALUES (1, '', '') ON CONFLICT (id) DO NOTHING`;
    await sql`ALTER TABLE master_contract_template ADD COLUMN IF NOT EXISTS document_path TEXT`;
    await sql`ALTER TABLE master_contract_template ADD COLUMN IF NOT EXISTS document_data TEXT`;
    await sql`ALTER TABLE master_contract_template ADD COLUMN IF NOT EXISTS body_margins TEXT`;
    console.log("[migrate] master_contract_template OK");
    await sql`
      CREATE TABLE IF NOT EXISTS company_contract_template (
        company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        document_path TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE company_contract_template ADD COLUMN IF NOT EXISTS body_margins TEXT`;
    await sql`ALTER TABLE company_contract_template ADD COLUMN IF NOT EXISTS document_data TEXT`;
    console.log("[migrate] company_contract_template OK");
    await sql`
      CREATE TABLE IF NOT EXISTS site_material_list_items (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        estimate_id INT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
        item_name TEXT,
        image_url TEXT,
        size TEXT,
        hole_size_install TEXT,
        remarks TEXT,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE site_material_list_items ADD COLUMN IF NOT EXISTS product_name_code TEXT`;
    await sql`ALTER TABLE site_material_list_items ADD COLUMN IF NOT EXISTS shopping_link TEXT`;
    await sql`
      CREATE TABLE IF NOT EXISTS site_material_list_sections (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        estimate_id INT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE site_material_list_items ADD COLUMN IF NOT EXISTS section_id INT REFERENCES site_material_list_sections(id) ON DELETE CASCADE`;
    console.log("[migrate] site_material_list_items OK");
    await sql`
      CREATE TABLE IF NOT EXISTS material_order_drafts (
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        estimate_id INT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
        data_json TEXT NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, estimate_id)
      )
    `;
    console.log("[migrate] material_order_drafts OK");
    await sql`
      CREATE TABLE IF NOT EXISTS company_order_template (
        company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        data_json TEXT NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log("[migrate] company_order_template OK");
    await sql`
      CREATE TABLE IF NOT EXISTS company_schedule_phase_buttons (
        company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        labels_json TEXT NOT NULL DEFAULT '[]',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log("[migrate] company_schedule_phase_buttons OK");
    await sql`
      CREATE TABLE IF NOT EXISTS master_smtp_config (
        id INT PRIMARY KEY DEFAULT 1,
        smtp_oauth_provider TEXT,
        smtp_oauth_refresh_token TEXT,
        smtp_user TEXT,
        smtp_host TEXT,
        smtp_port TEXT,
        smtp_pass TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT master_smtp_config_single CHECK (id = 1)
      )
    `;
    await sql`INSERT INTO master_smtp_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
    console.log("[migrate] master_smtp_config OK");
    await sql`
      CREATE TABLE IF NOT EXISTS oauth_pending_state (
        state_token TEXT PRIMARY KEY,
        company_id INT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `;
    console.log("[migrate] oauth_pending_state OK");
    await sql`
      CREATE TABLE IF NOT EXISTS shop_products (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        brand TEXT,
        spec TEXT,
        unit TEXT,
        price NUMERIC(14,2) NOT NULL DEFAULT 0,
        sale_price NUMERIC(14,2),
        stock_status TEXT,
        image_url TEXT,
        product_url TEXT,
        shop_line TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, sku)
      )
    `;
    await sql`ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS shop_line TEXT`;
    await sql`ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS image_data TEXT`;
    await sql`ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS image_mime TEXT`;
    await sql`ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS is_hit BOOLEAN NOT NULL DEFAULT false`;
    await sql`CREATE INDEX IF NOT EXISTS shop_products_company_active_idx ON shop_products(company_id, is_active, name)`;
    await sql`CREATE INDEX IF NOT EXISTS shop_products_company_line_idx ON shop_products(company_id, shop_line)`;
    console.log("[migrate] shop_products OK");
    await sql`
      CREATE TABLE IF NOT EXISTS shop_secret_tokens (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        note TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS shop_secret_tokens_company_idx ON shop_secret_tokens(company_id, expires_at)`;
    console.log("[migrate] shop_secret_tokens OK");
    await sql`
      CREATE TABLE IF NOT EXISTS shop_taxonomy_lines (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, name)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS shop_taxonomy_lines_company_idx ON shop_taxonomy_lines(company_id, sort_order, name)`;
    await sql`
      CREATE TABLE IF NOT EXISTS shop_taxonomy_subcategories (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        shop_line TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, shop_line, name)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS shop_taxonomy_sub_company_line_idx ON shop_taxonomy_subcategories(company_id, shop_line, sort_order)`;
    console.log("[migrate] shop_taxonomy OK");
    console.log("[migrate] 완료");
  } catch (err) {
    console.error("[migrate] 실패:", err.message);
    process.exit(1);
  }
  process.exit(0);
}

migrate();
