import { LayoutDashboard, FileText, FolderKanban, Calendar } from "lucide-react";

const cards = [
  { label: "진행 중인 상담", value: "—", icon: LayoutDashboard },
  { label: "진행 중인 견적", value: "—", icon: FileText },
  { label: "진행 중인 프로젝트", value: "—", icon: FolderKanban },
  { label: "이번 주 일정", value: "—", icon: Calendar },
];

export default function DashboardPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">대시보드</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{label}</span>
              <Icon className="h-5 w-5 text-gray-400" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
