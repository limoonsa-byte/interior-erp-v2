import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");

  if (!cookie) {
    return NextResponse.json({ company: null }, { status: 200 });
  }

  try {
    const company = JSON.parse(cookie.value) as {
      id: number;
      code: string;
      name: string;
    };
    return NextResponse.json({ company }, { status: 200 });
  } catch {
    return NextResponse.json({ company: null }, { status: 200 });
  }
}

