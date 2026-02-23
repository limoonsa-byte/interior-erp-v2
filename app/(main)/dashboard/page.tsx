"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, FileText, FolderKanban, Calendar } from "lucide-react";

type Consultation = {
  id: number;
  status: string;
  constructionStartAt?: string;
  moveInAt?: string;
  schedulePhases?: { start?: string; end?: string }[];
};

export default function DashboardPage() {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [estimateCount, setEstimateCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/consultations").then((r) => r.json()),
      fetch("/api/estimates").then((r) => r.json()),
    ])
      .then(([cons, est]) => {
        setConsultations(Array.isArray(cons) ? cons : []);
        setEstimateCount(Array.isArray(est) ? est.length : 0);
      })
      .catch(() => {
        setConsultations([]);
        setEstimateCount(0);
      })
      .finally(() => setLoading(false));
  }, []);

  const projectCount = consultations.filter(
    (c) =>
      (c.constructionStartAt && c.constructionStartAt.trim()) ||
      (Array.isArray(c.schedulePhases) && c.schedulePhases.length > 0)
  ).length;

  const thisWeek = (() => {
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const y = mon.getFullYear();
    const m = String(mon.getMonth() + 1).padStart(2, "0");
    const d = String(mon.getDate()).padStart(2, "0");
    const y2 = sun.getFullYear();
    const m2 = String(sun.getMonth() + 1).padStart(2, "0");
    const d2 = String(sun.getDate()).padStart(2, "0");
    return { start: `${y}-${m}-${d}`, end: `${y2}-${m2}-${d2}` };
  })();

  const thisWeekScheduleCount = consultations.filter((c) => {
    const start = c.constructionStartAt?.trim().slice(0, 10);
    const end = (c.moveInAt || c.constructionStartAt)?.trim().slice(0, 10);
    if (!start) return false;
    const e = end && end >= start ? end : start;
    return start <= thisWeek.end && e >= thisWeek.start;
  }).length;

  const cards = [
    { label: "진행 중인 상담", value: loading ? "—" : String(consultations.length), icon: LayoutDashboard },
    { label: "진행 중인 견적", value: loading ? "—" : String(estimateCount ?? "—"), icon: FileText },
    {
      label: "진행 중인 프로젝트",
      value: loading ? "—" : String(projectCount),
      icon: FolderKanban,
      href: "/projects",
    },
    { label: "이번 주 일정", value: loading ? "—" : String(thisWeekScheduleCount), icon: Calendar },
  ];

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">대시보드</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, href }) => {
          const content = (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{label}</span>
                <Icon className="h-5 w-5 text-gray-400" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
            </>
          );
          const wrap = "rounded-xl border border-gray-200 bg-white p-5 shadow-sm";
          if (href) {
            return (
              <Link key={label} href={href} className={`block ${wrap} hover:border-blue-200 hover:bg-blue-50/30 transition-colors`}>
                {content}
              </Link>
            );
          }
          return (
            <div key={label} className={wrap}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
