"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function MasterAdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/company/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.company?.isMaster) {
          setAllowed(true);
        } else {
          setAllowed(false);
          router.replace("/admin");
        }
      })
      .catch(() => {
        setAllowed(false);
        router.replace("/admin");
      });
  }, [router]);

  if (allowed === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-gray-500">확인 중...</p>
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">마스터 관리</h1>
      <p className="text-sm text-gray-600">
        마스터 계정 전용 페이지입니다. 시스템 전역 설정·회사 목록 등 필요한 기능을 여기에 추가할 수 있습니다.
      </p>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
        <p className="text-sm text-gray-500">추가 기능이 필요하면 알려 주세요.</p>
      </div>
    </div>
  );
}
