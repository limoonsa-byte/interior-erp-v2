import { cookies } from "next/headers";

export type CompanySession = {
  id: number;
  code: string;
  name: string;
  picId?: number;
  picName?: string;
};

export async function getCompanyFromCookie(): Promise<CompanySession | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    const parsed = JSON.parse(cookie.value) as CompanySession;
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getPicIdFromSession(company: CompanySession): number | null {
  const id = Number(company.picId);
  return Number.isInteger(id) && id > 0 ? id : null;
}
