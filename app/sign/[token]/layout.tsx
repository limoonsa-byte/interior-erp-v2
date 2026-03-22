import type { Metadata } from "next";
import { getAppBaseUrl } from "@/lib/appUrl";

const signTitle = "계약서 서명하기";
const signDescription = "계약서 서명 링크입니다. 링크를 열어 서명을 진행해 주세요.";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const base = getAppBaseUrl();
  const canonicalUrl = `${base.replace(/\/$/, "")}/sign/${token}`;

  return {
    title: signTitle,
    description: signDescription,
    openGraph: {
      title: signTitle,
      description: signDescription,
      type: "website",
      url: canonicalUrl,
    },
    twitter: {
      card: "summary",
      title: signTitle,
      description: signDescription,
    },
    alternates: { canonical: canonicalUrl },
  };
}

export default function SignTokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
