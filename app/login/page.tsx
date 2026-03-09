"use client";

import { useState, useEffect } from "react";

const SAVE_LOGIN_KEY = "erp_save_login";
const SAVE_CODE_KEY = "erp_login_code";
const SAVE_EMPLOYEE_KEY = "erp_login_employee";
const SAVE_PASSWORD_KEY = "erp_login_password";

type SignupState = {
  name: string;
  code: string;
  password: string;
  ownerEmail: string;
};

type LoginState = {
  code: string;
  employeeCode: string;
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
  const [login, setLogin] = useState<LoginState>({ code: "", employeeCode: "", password: "" });
  const [saveLogin, setSaveLogin] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(SAVE_LOGIN_KEY);
      if (saved === "1") {
        setSaveLogin(true);
        const code = localStorage.getItem(SAVE_CODE_KEY);
        const emp = localStorage.getItem(SAVE_EMPLOYEE_KEY);
        const pwd = localStorage.getItem(SAVE_PASSWORD_KEY);
        setLogin((prev) => ({
          ...prev,
          code: code ?? prev.code,
          employeeCode: emp ?? prev.employeeCode,
          password: pwd ?? prev.password,
        }));
      }
    } catch (_) {}
  }, []);

  // 아이디(회사아이디) / 비밀번호 찾기
  const [findMode, setFindMode] = useState<FindMode>(null);
  const [findEmail, setFindEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [findResult, setFindResult] = useState<{ companyName: string; code: string } | null>(null);

  const handleSignup = async () => {
    if (!signup.name || !signup.code || !signup.password) {
      alert("회사명 / 회사아이디 / 비밀번호를 모두 입력해 주세요.");
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
      setLogin({ code: signup.code, employeeCode: "", password: "" });
    } catch {
      alert("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!login.code || !login.password) {
      alert("회사아이디와 비밀번호를 입력해 주세요.");
      return;
    }
    if (!login.employeeCode.trim()) {
      alert("개인코드를 입력해 주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/company/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: login.code,
          password: login.password,
          employeeCode: login.employeeCode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert((data.error || "로그인에 실패했습니다.") + (data.debug ? "\n\n[개발] " + data.debug : ""));
        return;
      }
      if (saveLogin) {
        try {
          localStorage.setItem(SAVE_LOGIN_KEY, "1");
          localStorage.setItem(SAVE_CODE_KEY, login.code.trim());
          localStorage.setItem(SAVE_EMPLOYEE_KEY, login.employeeCode.trim());
          localStorage.setItem(SAVE_PASSWORD_KEY, login.password);
        } catch (_) {}
      } else {
        try {
          localStorage.removeItem(SAVE_LOGIN_KEY);
          localStorage.removeItem(SAVE_CODE_KEY);
          localStorage.removeItem(SAVE_EMPLOYEE_KEY);
          localStorage.removeItem(SAVE_PASSWORD_KEY);
        } catch (_) {}
      }
      // 쿠키는 서버에서 설정되므로 여기서는 메인 페이지로 이동만 수행
      window.location.href = "/consulting";
    } catch {
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
    } catch {
      alert("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetCode.trim() || !resetEmail.trim() || !resetPassword) {
      alert("회사아이디, 이메일, 새 비밀번호를 모두 입력해 주세요.");
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
    } catch {
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
    <div className="flex min-h-screen min-h-[100dvh] flex-col items-center justify-center bg-gray-50 px-4 py-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <h1 className="mb-2 text-center text-2xl font-semibold text-gray-900">
          인테리어 올인원 ERP시스템
        </h1>
        <p className="mb-6 text-center text-xs text-gray-500">
          회사아이디 · 개인코드 · 비밀번호로 ERP 로그인합니다.
        </p>

        <div className="mb-6 flex rounded-xl bg-gray-100 p-1 text-sm font-medium text-gray-700">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`min-h-[44px] flex-1 rounded-lg py-2.5 ${
              mode === "login" ? "bg-white shadow-sm" : "text-gray-500"
            }`}
          >
            ERP 로그인
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`min-h-[44px] flex-1 rounded-lg py-2.5 ${
              mode === "signup" ? "bg-white shadow-sm" : "text-gray-500"
            }`}
          >
            새 회사 만들기
          </button>
        </div>

        {mode === "signup" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900">
              <p className="font-medium mb-1">새 회사 등록 안내</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-blue-800">
                <li>관리자 개인코드 기본값은 <strong>0000</strong>이며, 원하면 담당자 설정에서 변경할 수 있습니다.</li>
                <li>가입 후 <strong>ERP 로그인</strong>에서 회사아이디 · 개인코드 · 비밀번호로 로그인합니다.</li>
                <li>관리 → 담당자 설정에서 담당자(개인코드·비밀번호)를 추가하면 담당자로 로그인할 수 있습니다.</li>
              </ul>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                회사명
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
                value={signup.name}
                onChange={(e) =>
                  setSignup((s) => ({ ...s, name: e.target.value }))
                }
                placeholder="예: 오로인테리어"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                회사아이디
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
                value={signup.code}
                onChange={(e) =>
                  setSignup((s) => ({ ...s, code: e.target.value }))
                }
                placeholder="원하는 회사아이디 입력 (영문·숫자)"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                비밀번호
              </label>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
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
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
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
              className="mt-2 min-h-[48px] w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60"
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
                회사아이디
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
                value={login.code}
                onChange={(e) =>
                  setLogin((s) => ({ ...s, code: e.target.value }))
                }
                placeholder="회사아이디 입력"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                개인코드
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
                value={login.employeeCode}
                onChange={(e) =>
                  setLogin((s) => ({ ...s, employeeCode: e.target.value }))
                }
                placeholder="개인코드 입력"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                비밀번호
              </label>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
                value={login.password}
                onChange={(e) =>
                  setLogin((s) => ({ ...s, password: e.target.value }))
                }
                placeholder="비밀번호 입력"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 py-1">
              <input
                type="checkbox"
                checked={saveLogin}
                onChange={(e) => setSaveLogin(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-slate-700"
              />
              <span className="text-sm text-gray-600">로그인 정보 저장 (회사·개인코드·비밀번호)</span>
            </label>
            <button
              type="submit"
              disabled={loading}
              className="mt-2 min-h-[48px] w-full rounded-lg bg-slate-800 py-3 text-sm font-semibold text-white hover:bg-slate-900 active:bg-slate-950 disabled:opacity-60"
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
                  회사아이디 찾기
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
                  가입 시 등록한 이메일로 회사아이디를 조회합니다.
                </p>
                <input
                  type="email"
                  className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
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
                    {loading ? "조회 중..." : "회사아이디 찾기"}
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
                    의 회사아이디는 <strong>{findResult.code}</strong> 입니다.
                  </p>
                )}
              </div>
            )}

            {findMode === "password" && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="mb-3 text-xs font-medium text-gray-700">
                  회사아이디와 가입 시 등록한 이메일로 새 비밀번호를 설정합니다.
                </p>
                <input
                  type="text"
                  className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
                  placeholder="회사아이디"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                />
                <input
                  type="email"
                  className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
                  placeholder="이메일 주소"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
                <input
                  type="password"
                  className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
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
