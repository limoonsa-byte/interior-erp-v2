import type { Metadata } from "next";
import ShopSecretListClient from "./ShopSecretListClient";

export const metadata: Metadata = {
  title: "업자들의 비밀창고",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ShopSecretListClient />;
}
