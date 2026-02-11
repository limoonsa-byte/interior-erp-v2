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

type FindMode = null | "code" | "password";

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

  // 아이디(회사코드) / 비밀번호 찾기
  const [findMode, setFindMode] = useState<FindMode>(null);
  const [findEmail, setFindEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [findResult, setFindResult] = useState<{ companyName: string; code: string } | null>(null);

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

  const handleFindCode = async () => {
    if (!findEmail.trim()) {
      alert("이메일을 입력해 주세요.");
      return;
    }
    setLoading(true);
    setFindResult(null);
    try {
      const res = await fetch("/api/company/find-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: findEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "조회에 실패했습니다.");
        return;
      }
      setFindResult({ companyName: data.companyName, code: data.code });
    } catch (e) {
      alert("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetCode.trim() || !resetEmail.trim() || !resetPassword) {
      alert("회사코드, 이메일, 새 비밀번호를 모두 입력해 주세요.");
      return;
    }
    if (resetPassword.length < 6) {
      alert("새 비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/company/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: resetCode.trim(),
          email: resetEmail.trim(),
          newPassword: resetPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "비밀번호 변경에 실패했습니다.");
        return;
      }
      alert(data.message || "비밀번호가 변경되었습니다. 로그인해 주세요.");
      setFindMode(null);
      setResetCode("");
      setResetEmail("");
      setResetPassword("");
      setLogin((l) => ({ ...l, code: resetCode.trim(), password: "" }));
    } catch (e) {
      alert("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const closeFind = () => {
    setFindMode(null);
    setFindEmail("");
    setFindResult(null);
    setResetCode("");
    setResetEmail("");
    setResetPassword("");
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
          <>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
          >
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
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-slate-800 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </form>

          <div className="space-y-4">
            {!findMode && (
              <p className="mt-4 text-center text-xs text-gray-500">
                <button
                  type="button"
                  onClick={() => setFindMode("code")}
                  className="underline hover:text-gray-700"
                >
                  회사코드 찾기
                </button>
                {" · "}
                <button
                  type="button"
                  onClick={() => setFindMode("password")}
                  className="underline hover:text-gray-700"
                >
                  비밀번호 찾기
                </button>
              </p>
            )}

            {findMode === "code" && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="mb-2 text-xs font-medium text-gray-700">
                  가입 시 등록한 이메일로 회사코드를 조회합니다.
                </p>
                <input
                  type="email"
                  className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="이메일 주소"
                  value={findEmail}
                  onChange={(e) => setFindEmail(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleFindCode}
                    disabled={loading}
                    className="flex-1 rounded-lg bg-slate-600 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                  >
                    {loading ? "조회 중..." : "회사코드 찾기"}
                  </button>
                  <button
                    type="button"
                    onClick={closeFind}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
                  >
                    취소
                  </button>
                </div>
                {findResult && (
                  <p className="mt-3 rounded-lg bg-white p-3 text-sm text-gray-800">
                    <span className="font-medium">{findResult.companyName}</span>
                    의 회사코드는 <strong>{findResult.code}</strong> 입니다.
                  </p>
                )}
              </div>
            )}

            {findMode === "password" && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="mb-3 text-xs font-medium text-gray-700">
                  회사코드와 가입 시 등록한 이메일로 새 비밀번호를 설정합니다.
                </p>
                <input
                  type="text"
                  className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="회사코드"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                />
                <input
                  type="email"
                  className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="이메일 주소"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
                <input
                  type="password"
                  className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="새 비밀번호 (6자 이상)"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={loading}
                    className="flex-1 rounded-lg bg-slate-600 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                  >
                    {loading ? "변경 중..." : "비밀번호 변경"}
                  </button>
                  <button
                    type="button"
                    onClick={closeFind}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
