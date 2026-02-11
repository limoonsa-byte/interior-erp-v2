"use client";

import { useState } from "react";

type SignupState = {
  name: string;
  code: string;
  password: string;
  ownerEmail: string;
};

type LoginState = {
  code: string;
  password: string;
};

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [signup, setSignup] = useState<SignupState>({
    name: "",
    code: "",
    password: "",
    ownerEmail: "",
  });
  const [login, setLogin] = useState<LoginState>({ code: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!signup.name || !signup.code || !signup.password) {
      alert("회사명 / 회사코드 / 비밀번호를 모두 입력해 주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/company/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signup),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "회사 생성에 실패했습니다.");
        return;
      }
      alert(`회사 생성 완료!\n코드: ${data.code}\n이 코드로 로그인하세요.`);
      setMode("login");
      setLogin({ code: signup.code, password: "" });
    } catch (e) {
      alert("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!login.code || !login.password) {
      alert("회사코드와 비밀번호를 입력해 주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/company/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(login),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "로그인에 실패했습니다.");
        return;
      }
      // 쿠키는 서버에서 설정되므로 여기서는 메인 페이지로 이동만 수행
      window.location.href = "/dashboard";
    } catch (e) {
      alert("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-center text-2xl font-semibold text-gray-900">
          인테리어 ERP
        </h1>
        <p className="mb-6 text-center text-xs text-gray-500">
          회사코드로 로그인해서 회사별 ERP를 사용합니다.
        </p>

        <div className="mb-6 flex rounded-xl bg-gray-100 p-1 text-sm font-medium text-gray-700">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-lg py-2 ${
              mode === "login" ? "bg-white shadow-sm" : "text-gray-500"
            }`}
          >
            회사코드 로그인
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-lg py-2 ${
              mode === "signup" ? "bg-white shadow-sm" : "text-gray-500"
            }`}
          >
            새 회사 만들기
          </button>
        </div>

        {mode === "signup" ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                회사명
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={signup.name}
                onChange={(e) =>
                  setSignup((s) => ({ ...s, name: e.target.value }))
                }
                placeholder="예: 오로인테리어"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                회사코드
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={signup.code}
                onChange={(e) =>
                  setSignup((s) => ({ ...s, code: e.target.value }))
                }
                placeholder="로그인에 사용할 코드 (영문/숫자)"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                비밀번호
              </label>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={signup.password}
                onChange={(e) =>
                  setSignup((s) => ({ ...s, password: e.target.value }))
                }
                placeholder="최소 6자 이상"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                사장님 이메일 (선택)
              </label>
              <input
                type="email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={signup.ownerEmail}
                onChange={(e) =>
                  setSignup((s) => ({ ...s, ownerEmail: e.target.value }))
                }
                placeholder="영업용 안내 메일 수신용"
              />
            </div>
            <button
              type="button"
              onClick={handleSignup}
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "처리 중..." : "회사 생성하기"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                회사코드
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={login.code}
                onChange={(e) =>
                  setLogin((s) => ({ ...s, code: e.target.value }))
                }
                placeholder="발급받은 회사코드"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                비밀번호
              </label>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={login.password}
                onChange={(e) =>
                  setLogin((s) => ({ ...s, password: e.target.value }))
                }
                placeholder="회사 비밀번호"
              />
            </div>
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-slate-800 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
