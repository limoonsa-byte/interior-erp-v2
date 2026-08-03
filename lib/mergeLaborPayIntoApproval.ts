import { sql } from "@vercel/postgres";

type ApprovalEntry = {
  item?: string;
  memo?: string;
  amount?: number;
  laborPayRequestId?: number;
};

type ApprovalSection = {
  date?: string;
  entries?: ApprovalEntry[];
};

type ApprovalPayload = {
  schema?: string;
  sections?: ApprovalSection[];
};

function todaySeoulDateKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseApproval(raw: unknown): ApprovalPayload {
  if (raw == null) return { schema: "approval_v1", sections: [] };
  const text = typeof raw === "string" ? raw.trim() : JSON.stringify(raw);
  if (!text || text === "{}") return { schema: "approval_v1", sections: [] };
  try {
    const parsed = JSON.parse(text) as ApprovalPayload;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.sections)) {
      return {
        schema: "approval_v1",
        sections: parsed.sections.map((s) => ({
          date: typeof s?.date === "string" ? s.date : "",
          entries: Array.isArray(s?.entries) ? s.entries : [],
        })),
      };
    }
  } catch {
    /* ignore */
  }
  return { schema: "approval_v1", sections: [] };
}

async function loadApprovalJson(estimateId: number, companyId: number): Promise<string> {
  try {
    const r = await sql`
      SELECT data_json FROM estimate_payment_approvals
      WHERE estimate_id = ${estimateId} AND company_id = ${companyId}
      LIMIT 1
    `;
    if (r.rows.length > 0) {
      const raw = (r.rows[0] as { data_json?: unknown }).data_json;
      return raw == null ? "" : typeof raw === "string" ? raw : JSON.stringify(raw);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/estimate_payment_approvals|does not exist/i.test(msg)) throw e;
  }
  return "";
}

async function saveApprovalJson(estimateId: number, companyId: number, dataJson: string): Promise<void> {
  try {
    await sql`
      INSERT INTO estimate_payment_approvals (estimate_id, company_id, data_json, updated_at)
      VALUES (${estimateId}, ${companyId}, ${dataJson}, NOW())
      ON CONFLICT (estimate_id) DO UPDATE SET
        data_json = EXCLUDED.data_json,
        updated_at = NOW()
    `;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/estimate_payment_approvals|does not exist/i.test(msg)) {
      await sql`
        CREATE TABLE IF NOT EXISTS estimate_payment_approvals (
          estimate_id INT PRIMARY KEY REFERENCES estimates(id) ON DELETE CASCADE,
          company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          data_json TEXT NOT NULL DEFAULT '{}',
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;
      await sql`
        INSERT INTO estimate_payment_approvals (estimate_id, company_id, data_json, updated_at)
        VALUES (${estimateId}, ${companyId}, ${dataJson}, NOW())
        ON CONFLICT (estimate_id) DO UPDATE SET
          data_json = EXCLUDED.data_json,
          updated_at = NOW()
      `;
      return;
    }
    throw e;
  }
}

function stripEmptyPlaceholderEntries(entries: ApprovalEntry[]): ApprovalEntry[] {
  return entries.filter((e) => {
    const item = String(e.item ?? "").trim();
    const memo = String(e.memo ?? "").trim();
    const amount = Number(e.amount) || 0;
    return item !== "" || memo !== "" || amount !== 0 || e.laborPayRequestId != null;
  });
}

/** 인건비 제출 건을 해당 현장 결제 승인서(approval_v1)에 합친다. */
export async function mergeLaborPayIntoApproval(opts: {
  estimateId: number;
  companyId: number;
  laborPayRequestId: number;
  workerName: string;
  amount: number;
  content: string;
}): Promise<void> {
  const { estimateId, companyId, laborPayRequestId, workerName, amount, content } = opts;
  const payload = parseApproval(await loadApprovalJson(estimateId, companyId));
  const sections = Array.isArray(payload.sections) ? [...payload.sections] : [];

  // 동일 요청이 이미 있으면 제거 후 다시 넣음 (재제출 방지용 멱등)
  for (const section of sections) {
    if (!Array.isArray(section.entries)) continue;
    section.entries = section.entries.filter((e) => e.laborPayRequestId !== laborPayRequestId);
  }

  const dateKey = todaySeoulDateKey();
  let section = sections.find((s) => String(s.date ?? "").trim().slice(0, 10) === dateKey);
  if (!section) {
    section = { date: dateKey, entries: [] };
    sections.push(section);
  }
  if (!Array.isArray(section.entries)) section.entries = [];
  section.entries = stripEmptyPlaceholderEntries(section.entries);
  section.entries.push({
    item: `인건비 · ${workerName.trim() || "인부"}`,
    memo: content.trim(),
    amount: Math.round(amount),
    laborPayRequestId,
  });

  const next: ApprovalPayload = {
    schema: "approval_v1",
    sections: sections
      .map((s) => ({
        date: String(s.date ?? "").trim().slice(0, 10),
        entries: stripEmptyPlaceholderEntries(Array.isArray(s.entries) ? s.entries : []),
      }))
      .filter((s) => s.entries.length > 0 || s.date === dateKey),
  };

  await saveApprovalJson(estimateId, companyId, JSON.stringify(next));
}

/** 재발급·삭제 시 결제 승인서에서 해당 인건비 항목 제거 */
export async function removeLaborPayFromApproval(opts: {
  estimateId: number;
  companyId: number;
  laborPayRequestId: number;
}): Promise<void> {
  const { estimateId, companyId, laborPayRequestId } = opts;
  const raw = await loadApprovalJson(estimateId, companyId);
  if (!raw.trim()) return;

  const payload = parseApproval(raw);
  const sections = (payload.sections ?? []).map((s) => ({
    date: String(s.date ?? "").trim().slice(0, 10),
    entries: stripEmptyPlaceholderEntries(
      (Array.isArray(s.entries) ? s.entries : []).filter((e) => e.laborPayRequestId !== laborPayRequestId)
    ),
  })).filter((s) => s.entries.length > 0);

  if (sections.length === 0) {
    await saveApprovalJson(estimateId, companyId, JSON.stringify({ schema: "approval_v1", sections: [] }));
    return;
  }

  await saveApprovalJson(
    estimateId,
    companyId,
    JSON.stringify({ schema: "approval_v1", sections })
  );
}
