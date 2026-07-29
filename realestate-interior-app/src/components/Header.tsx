import Link from "next/link";
import { Building2, Menu } from "lucide-react";

const links = [
  { href: "/properties", label: "매물" },
  { href: "/styles", label: "인테리어" },
  { href: "/estimate", label: "견적" },
  { href: "/portfolio", label: "시공사례" },
  { href: "/consult", label: "상담예약" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-stone-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900 text-white">
            <Building2 className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            SpaceNest
            <span className="block text-xs font-normal text-stone-500">
              부동산 × 인테리어
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/consult"
            className="hidden rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700 sm:inline-flex"
          >
            무료 상담
          </Link>
          <details className="relative md:hidden">
            <summary className="flex list-none cursor-pointer rounded-lg p-2 text-stone-700 [&::-webkit-details-marker]:hidden">
              <Menu className="h-5 w-5" />
            </summary>
            <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-xl px-3 py-2.5 text-sm text-stone-700 hover:bg-stone-50"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/consult"
                className="mt-1 block rounded-xl bg-stone-900 px-3 py-2.5 text-center text-sm text-white"
              >
                무료 상담
              </Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-stone-200 bg-stone-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="font-semibold text-stone-800">SpaceNest</p>
          <p>매물 탐색부터 인테리어 시공까지 한 번에</p>
        </div>
        <p>© {new Date().getFullYear()} SpaceNest. Cloud-ready demo.</p>
      </div>
    </footer>
  );
}
