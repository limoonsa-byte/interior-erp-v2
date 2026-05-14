/** 백만 원 단위 반내림 (예: 10,126,000원 → 10,000,000원) */
const WON_FLOOR_UNIT = 1_000_000;

export function floorWonToMillion(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.floor(amount / WON_FLOOR_UNIT) * WON_FLOOR_UNIT;
}

/** 계약금액 문자열 → 숫자(원) */
export function parseContractRawAmount(contractAmountStr: string | undefined | null): number {
  return Number(String(contractAmountStr ?? "").replace(/\D/g, "")) || 0;
}

/** 퍼센트 입력 → 원 단위 금액(반올림) */
export function amountFromPercentOfTotal(rawTotal: number, percentStr: string | undefined | null): number {
  if (!rawTotal) return 0;
  const t = String(percentStr ?? "").trim().replace(/,/g, "");
  if (!t) return 0;
  const p = parseFloat(t);
  if (!Number.isFinite(p) || p < 0) return 0;
  return Math.round((rawTotal * p) / 100);
}

/** 잔금 비중(0~100) 표시용 문자열 */
export function formatPercentFromShare(shareOfTotal: number): string {
  if (!Number.isFinite(shareOfTotal) || shareOfTotal < 0) return "";
  if (shareOfTotal === 0) return "0";
  const pct = shareOfTotal * 100;
  const rounded = Math.round(pct * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

export type InterimLine = { percent: string; daysAfter?: string };

/**
 * 선금·중도금은 퍼센트 기준 금액, 잔금은 (총액 − 선금 − 중도금 합)으로 표시.
 * 선금·중도금 퍼센트가 모두 비어 있으면 기존처럼 legacy balancePercent만으로 잔금 금액을 씁니다.
 */
export function computePaymentScheduleForDisplay(
  rawTotal: number,
  downPaymentPercent: string,
  interimLines: ReadonlyArray<InterimLine>,
  legacyBalancePercent: string
): {
  downAmount: number;
  interimAmounts: number[];
  balanceAmount: number;
  balancePercentLabel: string;
} {
  const downAmount = floorWonToMillion(amountFromPercentOfTotal(rawTotal, downPaymentPercent));
  const interimAmounts = interimLines.map((l) =>
    floorWonToMillion(amountFromPercentOfTotal(rawTotal, l.percent))
  );
  const interimSum = interimAmounts.reduce((a, b) => a + b, 0);
  const hasScheduledInputs =
    String(downPaymentPercent ?? "").trim() !== "" ||
    interimLines.some((l) => String(l.percent ?? "").trim() !== "");

  if (rawTotal > 0 && hasScheduledInputs) {
    const balanceAmount = Math.max(0, rawTotal - downAmount - interimSum);
    const balancePercentLabel = formatPercentFromShare(balanceAmount / rawTotal);
    return { downAmount, interimAmounts, balanceAmount, balancePercentLabel };
  }

  const balPct = String(legacyBalancePercent ?? "").trim();
  const balanceAmount = floorWonToMillion(amountFromPercentOfTotal(rawTotal, balPct));
  return {
    downAmount,
    interimAmounts,
    balanceAmount,
    balancePercentLabel: balPct,
  };
}

export function parseInterimLinesFromDetails(details: Record<string, unknown>): InterimLine[] {
  try {
    const rawP = details.interimPayments;
    if (rawP && typeof rawP === "string" && rawP.trim()) {
      const parsed = JSON.parse(rawP) as Array<{ percent?: string; daysAfter?: string }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((p) => ({
          percent: String(p.percent ?? ""),
          daysAfter: String(p.daysAfter ?? ""),
        }));
      }
    }
    if (Array.isArray(rawP) && rawP.length > 0) {
      return (rawP as Array<{ percent?: string; daysAfter?: string }>).map((p) => ({
        percent: String(p.percent ?? ""),
        daysAfter: String(p.daysAfter ?? ""),
      }));
    }
  } catch {
    /* ignore */
  }
  return [
    {
      percent: String(details.interimPercent ?? ""),
      daysAfter: String(details.interimDaysAfter ?? ""),
    },
  ];
}
