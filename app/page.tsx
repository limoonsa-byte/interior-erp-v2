import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  if (process.env.NODE_ENV === "development") {
    redirect("/login");
  }
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/consulting");
  }
  const cookieStore = await cookies();
  const companyCookie = cookieStore.get("company");
  if (companyCookie?.value) {
    redirect("/consulting");
  }
  redirect("/login");
}
