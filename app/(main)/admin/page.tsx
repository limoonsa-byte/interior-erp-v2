"use client";

import React, { useCallback, useEffect, useState } from "react";

type PicItem = { id: number; name: string; phone?: string };

type EstimateTemplateItem = { id: number; title: string; createdAt?: string };

type ModalKind = null | "pics" | "password-change" | "drawing-api" | "estimate-templates";

export default function AdminPage() {
  const [pinStatus, setPinStatus] = useState<{ hasPin: boolean } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pinError, setPinError] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);

  const [pics, setPics] = useState<PicItem[]>([]);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMessage, setPwMessage] = useState("");

  const [drawingApiUrl, setDrawingApiUrl] = useState("");
  const [drawingApiLoading, setDrawingApiLoading] = useState(false);
  const [drawingApiMessage, setDrawingApiMessage] = useState("");

  const [estimateTemplates, setEstimateTemplates] = useState<EstimateTemplateItem[]>([]);
  const [estimateTemplateTitle, setEstimateTemplateTitle] = useState("");
  const [estimateTemplateLoading, setEstimateTemplateLoading] = useState(false);
  const [estimateTemplateError, setEstimateTemplateError] = useState<string | null>(null);

  const loadPinStatus = useCallback(() => {
    fetch("/api/company/admin-pin")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setPinStatus({ hasPin: false });
          setPinError(data.error);
          return;
        }
        setPinStatus({ hasPin: !!data.hasPin });
        setPinError("");
      })
      .catch(() => {
        setPinStatus({ hasPin: false });
        setPinError("상태를 불러올 수 없습니다.");
      });
  }, []);

  useEffect(() => {
    loadPinStatus();
  }, [loadPinStatus]);

  const handlePinSubmit = () => {
    const pin = pinInput.replace(/\D/g, "").slice(0, 4);
    if (pin.length !== 4) {
      setPinError("숫자 4자리를 입력해 주세요.");
      return;
    }
    setPinError("");
    fetch("/api/company/admin-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.set) {
          setAdminUnlocked(true);
          setPinInput("");
          return;
        }
        if (data.ok) {
          setAdminUnlocked(true);
          setPinInput("");
          return;
        }
        setPinError("비밀번호가 일치하지 않습니다.");
      })
      .catch(() => setPinError("오류가 발생했습니다."));
  };

  const loadPics = useCallback(() => {
    fetch("/api/company/pics")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setPics(data);
          setError(null);
        } else {
          setError((data as { error?: string }).error || "목록을 불러올 수 없습니다.");
        }
      })
      .catch(() => setError("목록을 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (modal === "pics") loadPics();
    if (modal === "drawing-api") {
      setDrawingApiLoading(true);
      fetch("/api/company")
        .then((res) => res.json())
        .then((data) => {
          setDrawingApiUrl(data.drawingListApiUrl || "");
        })
        .catch(() => {})
        .finally(() => setDrawingApiLoading(false));
    }
    if (modal === "estimate-templates") {
      fetch("/api/company/estimate-templates")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setEstimateTemplates(data.map((t: { id: number; title: string; createdAt?: string }) => ({ id: t.id, title: t.title, createdAt: t.createdAt })));
          else setEstimateTemplates([]);
        })
        .catch(() => setEstimateTemplates([]));
      setEstimateTemplateTitle("");
      setEstimateTemplateError(null);
    }
  }, [modal, loadPics]);

  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal]);

  const handleAddPic = () => {
    const name = newName.trim();
    if (!name) return;
    setLoading(true);
    setError(null);
    fetch("/api/company/pics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone: newPhone.trim() }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setNewName("");
          setNewPhone("");
          setError(null);
          loadPics();
        } else {
          const msg = (data as { error?: string }).error || "추가 실패";
          setError(msg);
          alert(msg);
        }
        return null;
      })
      .catch(() => {
        setError("추가 중 오류가 발생했습니다.");
        alert("추가 중 오류가 발생했습니다.");
      })
      .finally(() => setLoading(false));
  };

  const handleDeletePic = (id: number) => {
    if (!confirm("이 담당자를 목록에서 삭제할까요?")) return;
    fetch(`/api/company/pics/${id}`, { method: "DELETE" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) loadPics();
        else alert((data as { error?: string }).error || "삭제 실패");
      })
      .catch(() => alert("삭제 중 오류가 발생했습니다."));
  };

  const handlePasswordChange = () => {
    const cur = pwCurrent.replace(/\D/g, "").slice(0, 4);
    const neu = pwNew.replace(/\D/g, "").slice(0, 4);
    const conf = pwConfirm.replace(/\D/g, "").slice(0, 4);
    if (cur.length !== 4 || neu.length !== 4 || conf.length !== 4) {
      setPwMessage("모두 숫자 4자리로 입력해 주세요.");
      return;
    }
    if (neu !== conf) {
      setPwMessage("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    setPwMessage("");
    fetch("/api/company/admin-pin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPin: cur, newPin: neu }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setPwCurrent("");
          setPwNew("");
          setPwConfirm("");
          setPwMessage("비밀번호가 변경되었습니다.");
          setTimeout(() => {
            setModal(null);
            setPwMessage("");
          }, 1500);
        } else {
          setPwMessage((data as { error?: string }).error || "변경 실패");
        }
      })
      .catch(() => setPwMessage("오류가 발생했습니다."));
  };

  const handleAddEstimateTemplate = () => {
    const title = estimateTemplateTitle.trim();
    if (!title) {
      setEstimateTemplateError("커스텀 견적 제목을 입력해 주세요.");
      return;
    }
    setEstimateTemplateError(null);
    setEstimateTemplateLoading(true);
    fetch("/api/company/estimate-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, items: [], processOrder: [] }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setEstimateTemplateTitle("");
          fetch("/api/company/estimate-templates")
            .then((r) => r.json())
            .then((arr) => {
              if (Array.isArray(arr)) {
                setEstimateTemplates(arr.map((t: EstimateTemplateItem) => ({ id: t.id, title: t.title, createdAt: t.createdAt })));
              }
            });
        } else {
          setEstimateTemplateError((data as { error?: string }).error || "저장 실패");
        }
      })
      .catch(() => setEstimateTemplateError("저장 중 오류가 발생했습니다."))
      .finally(() => setEstimateTemplateLoading(false));
  };

  const handleDeleteEstimateTemplate = (id: number) => {
    if (!confirm("이 견적 템플릿을 삭제할까요?")) return;
    fetch(`/api/company/estimate-templates/${id}`, { method: "DELETE" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setEstimateTemplates((prev) => prev.filter((t) => t.id !== id));
        } else {
          alert((data as { error?: string }).error || "삭제 실패");
        }
      })
      .catch(() => alert("삭제 중 오류가 발생했습니다."));
  };

  const handleSaveDrawingApi = () => {
    setDrawingApiMessage("");
    setDrawingApiLoading(true);
    fetch("/api/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drawingListApiUrl: drawingApiUrl.trim() }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setDrawingApiMessage("저장되었습니다.");
          setTimeout(() => {
            setModal(null);
            setDrawingApiMessage("");
          }, 1500);
        } else {
          setDrawingApiMessage((data as { error?: string }).error || "저장 실패");
        }
      })
      .catch(() => setDrawingApiMessage("오류가 발생했습니다."))
      .finally(() => setDrawingApiLoading(false));
  };

  if (pinStatus === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  if (!adminUnlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-xs rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-lg font-bold text-gray-800">관리</h1>
          {pinStatus.hasPin ? (
            <p className="mb-3 text-sm text-gray-600">관리 비밀번호를 입력하세요 (숫자 4자리)</p>
          ) : (
            <p className="mb-3 text-sm text-gray-600">관리 비밀번호를 설정하세요 (숫자 4자리)</p>
          )}
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
            placeholder="****"
            className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-widest"
          />
          {pinError && <p className="mb-2 text-sm text-red-600">{pinError}</p>}
          <button
            type="button"
            onClick={handlePinSubmit}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            확인
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white min-h-screen">
      <h1 className="mb-6 text-xl font-bold text-gray-800">관리</h1>

      <ul className="max-w-md space-y-2">
        <li>
          <button
            type="button"
            onClick={() => setModal("pics")}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100"
          >
            담당자 설정
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setModal("drawing-api")}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100"
          >
            도면 보관함 API 설정
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setModal("estimate-templates")}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100"
          >
            견적서 관리
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setModal("password-change")}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100"
          >
            관리 비밀번호 변경
          </button>
        </li>
      </ul>

      {/* 담당자 설정 모달 */}
      {modal === "pics" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">담당자 설정</h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              여기서 등록한 담당자는 상담 등록·수정 시 담당자 선택 목록에 표시됩니다.
            </p>
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddPic()}
                  placeholder="담당자명 입력"
                  className="min-w-[120px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddPic()}
                  placeholder="담당자 전화번호"
                  className="min-w-[120px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddPic}
                  disabled={loading || !newName.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  추가
                </button>
              </div>
            </div>
            {error && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {error}
              </div>
            )}
            {loading && pics.length === 0 ? (
              <p className="text-sm text-gray-500">불러오는 중...</p>
            ) : pics.length === 0 ? (
              <p className="text-sm text-gray-500">등록된 담당자가 없습니다. 위에서 추가해 주세요.</p>
            ) : (
              <ul className="space-y-2">
                {pics.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-gray-800">{item.name}</span>
                    <span className="text-gray-600">{item.phone || "-"}</span>
                    <button
                      type="button"
                      onClick={() => handleDeletePic(item.id)}
                      className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 도면 보관함 API 설정 모달 */}
      {modal === "drawing-api" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">도면 보관함 API 설정</h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-600">
              Google Apps Script 웹앱 URL을 입력하세요. 견적서 작성 시 도면 보관함에서 불러오기 기능에 사용됩니다.
            </p>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-gray-600">API URL (action=list 포함)</label>
              <input
                type="url"
                value={drawingApiUrl}
                onChange={(e) => setDrawingApiUrl(e.target.value)}
                placeholder="https://script.google.com/.../exec?action=list"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                disabled={drawingApiLoading}
              />
            </div>
            {drawingApiMessage && (
              <p className={`mb-3 text-sm ${drawingApiMessage.includes("저장되었습니다") ? "text-green-600" : "text-red-600"}`}>
                {drawingApiMessage}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={drawingApiLoading}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveDrawingApi}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={drawingApiLoading}
              >
                {drawingApiLoading ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 견적서 관리 모달 (커스텀 견적 제목 저장) */}
      {modal === "estimate-templates" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">견적서 관리</h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              커스텀 견적 제목을 정해서 저장해 두면, 견적서 작성 화면에서 &quot;커스텀 견적 불러오기&quot;로 불러올 수 있습니다. 여기서는 제목만 등록하고, 견적서 작성에서 항목을 채운 뒤 &quot;템플릿으로 저장&quot;하면 해당 제목의 템플릿에 내용이 저장됩니다.
            </p>
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                value={estimateTemplateTitle}
                onChange={(e) => setEstimateTemplateTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddEstimateTemplate()}
                placeholder="예: 아파트 표준견적, 상가 견적"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleAddEstimateTemplate}
                disabled={estimateTemplateLoading || !estimateTemplateTitle.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                저장
              </button>
            </div>
            {estimateTemplateError && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {estimateTemplateError}
              </div>
            )}
            {estimateTemplates.length === 0 ? (
              <p className="text-sm text-gray-500">등록된 견적 템플릿이 없습니다. 위에서 커스텀 제목을 입력 후 저장해 주세요.</p>
            ) : (
              <ul className="space-y-2">
                {estimateTemplates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-gray-800">{t.title}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteEstimateTemplate(t.id)}
                      className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 관리 비밀번호 변경 모달 */}
      {modal === "password-change" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">관리 비밀번호 변경</h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-600">숫자 4자리로 입력하세요.</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">현재 비밀번호</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center tracking-widest"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">새 비밀번호</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center tracking-widest"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">새 비밀번호 확인</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center tracking-widest"
                />
              </div>
            </div>
            {pwMessage && (
              <p className={`mt-3 text-sm ${pwMessage.includes("변경되었습니다") ? "text-green-600" : "text-red-600"}`}>
                {pwMessage}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handlePasswordChange}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                변경
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-gray-400">이 페이지를 벗어나면 다시 비밀번호를 입력해야 합니다.</p>
    </div>
  );
}
