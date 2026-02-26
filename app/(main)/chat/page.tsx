"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MessageCircle, Send, MessageSquare, Bell, BellOff } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

const CHAT_TITLE = "인테리어 올인원 ERP";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

function b64urlToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function playNotificationSound() {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("ERP");
    u.volume = 1;
    u.lang = "ko-KR";
    u.rate = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const koVoice = voices.find((v) => v.lang.startsWith("ko"));
    if (koVoice) u.voice = koVoice;
    window.speechSynthesis.speak(u);
  } catch (_) {}
}

function unlockAudio() {
  if (typeof window === "undefined") return;
  if (window.speechSynthesis) window.speechSynthesis.getVoices();
}

type ChatMessage = {
  id: number;
  companyId: number;
  estimateId: number | null;
  senderName: string;
  body: string;
  createdAt: string | null;
};

type Estimate = {
  id: number;
  title?: string;
  customerName?: string;
};

export default function ChatPage() {
  const searchParams = useSearchParams();
  const estimateIdParam = searchParams.get("estimateId");
  const currentEstimateId = estimateIdParam ? parseInt(estimateIdParam, 10) : null;
  const isValidRoom = estimateIdParam === null || (currentEstimateId != null && !Number.isNaN(currentEstimateId) && currentEstimateId > 0);

  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [senderName, setSenderName] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastNotifiedIdRef = useRef<number>(0);
  const originalTitleRef = useRef<string>("");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [canShowNotificationUI, setCanShowNotificationUI] = useState(false);
  const [alarmMuted, setAlarmMuted] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("chat-alarm-muted") === "1"
  );
  const alarmMutedRef = useRef(false);

  useEffect(() => {
    alarmMutedRef.current = alarmMuted;
    if (typeof window !== "undefined") localStorage.setItem("chat-alarm-muted", alarmMuted ? "1" : "0");
  }, [alarmMuted]);

  const fetchMessages = useCallback(async (notifyOnReturn = false) => {
    if (!isValidRoom) return;
    try {
      const url = currentEstimateId != null
        ? `/api/company/chat?estimateId=${currentEstimateId}`
        : "/api/company/chat";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const nextMessages = Array.isArray(data) ? data : [];
        const prevLastId = lastNotifiedIdRef.current;
        const nextLast = nextMessages.length > 0 ? (nextMessages[nextMessages.length - 1] as ChatMessage) : null;
        const isNew = nextLast && (lastNotifiedIdRef.current > 0 && nextLast.id > lastNotifiedIdRef.current);
        const isFromOthers = nextLast && nextLast.senderName !== senderName && nextLast.senderName !== companyName;
        const shouldNotify = isNew && isFromOthers && !alarmMutedRef.current && typeof document !== "undefined";
        if (nextLast && lastNotifiedIdRef.current === 0) {
          lastNotifiedIdRef.current = nextLast.id;
        } else if (shouldNotify) {
          playNotificationSound();
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              new Notification("erp메세지", {
                body: nextLast!.body.slice(0, 80) + (nextLast!.body.length > 80 ? "…" : ""),
                tag: `erp-chat-${currentEstimateId ?? "all"}`,
              });
            } catch (_) {}
          }
          if (originalTitleRef.current === "") originalTitleRef.current = document.title;
          document.title = `(1) 채팅 - ${CHAT_TITLE}`;
          lastNotifiedIdRef.current = nextLast!.id;
        }
        setMessages(nextMessages);
        lastNotifiedIdRef.current = nextLast?.id ?? lastNotifiedIdRef.current;
      }
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [currentEstimateId, isValidRoom, senderName, companyName]);

  useEffect(() => {
    fetch("/api/company/me")
      .then((r) => r.json())
      .then((data) => {
        const company = data.company;
        const name = company?.name || company?.code || "";
        setCompanyName(name);
        if (!senderName) {
          const displayName = company?.picName || name || "";
          setSenderName(displayName);
        }
      })
      .catch(() => {});
  }, [senderName]);

  useEffect(() => {
    fetch("/api/estimates")
      .then((r) => r.json())
      .then((data) => setEstimates(Array.isArray(data) ? data : []))
      .catch(() => setEstimates([]));
  }, []);

  useEffect(() => {
    setCanShowNotificationUI(true);
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!isValidRoom || notificationPermission !== "granted" || typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let cancelled = false;
    (async () => {
      try {
        const vapidRes = await fetch("/api/company/chat/vapid-public");
        const { publicKey } = await vapidRes.json();
        if (!publicKey || cancelled) return;
        const reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/chat" });
        await reg.update();
        const sub = await reg.pushManager.getSubscription();
        if (sub && !cancelled) {
          await fetch("/api/company/chat/push-subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endpoint: sub.endpoint,
              keys: { p256dh: b64urlToBase64(sub.getKey("p256dh")), auth: b64urlToBase64(sub.getKey("auth")) },
              estimateId: currentEstimateId,
            }),
          });
          return;
        }
        const applicationServerKey = urlBase64ToUint8Array(publicKey);
        const newSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        if (cancelled) return;
        await fetch("/api/company/chat/push-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: newSub.endpoint,
            keys: {
              p256dh: b64urlToBase64(newSub.getKey("p256dh")),
              auth: b64urlToBase64(newSub.getKey("auth")),
            },
            estimateId: currentEstimateId,
          }),
        });
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [isValidRoom, notificationPermission, currentEstimateId]);

  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    const handleVisible = () => {
      if (!document.hidden) {
        fetchMessages(true).then(() => {
          if (originalTitleRef.current) {
            document.title = originalTitleRef.current;
            originalTitleRef.current = "";
          }
        });
        if (messages.length > 0) {
          const last = messages[messages.length - 1];
          lastNotifiedIdRef.current = last.id;
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, [fetchMessages, messages.length]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    const name = senderName.trim() || companyName || "사용자";
    setSending(true);
    try {
      const res = await fetch("/api/company/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderName: name,
          body: text,
          ...(currentEstimateId != null ? { estimateId: currentEstimateId } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setMessages((prev) => [
          ...prev,
          {
            id: data.id,
            companyId: data.companyId,
            estimateId: data.estimateId ?? null,
            senderName: data.senderName,
            body: data.body,
            createdAt: data.createdAt,
          },
        ]);
        setInput("");
        requestAnimationFrame(() => inputRef.current?.focus());
      } else {
        alert(data.error || "전송에 실패했습니다.");
      }
    } catch {
      alert("전송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  };

  const currentRoomLabel = currentEstimateId != null
    ? (estimates.find((e) => e.id === currentEstimateId)?.title || estimates.find((e) => e.id === currentEstimateId)?.customerName || `견적 #${currentEstimateId}`)
    : "회사 전체";

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* 채팅방 목록 (견적명 기준) */}
      <div className="w-56 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-sm font-semibold text-gray-700">채팅방 (견적명)</p>
        </div>
        <ul className="max-h-[320px] overflow-y-auto py-1">
          <li>
            <Link
              href="/chat"
              className={`block px-3 py-2.5 text-sm ${
                currentEstimateId === null
                  ? "bg-slate-100 font-medium text-slate-800"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 shrink-0" />
                회사 전체
              </span>
            </Link>
          </li>
          {estimates.map((e) => (
            <li key={e.id}>
              <Link
                href={`/chat?estimateId=${e.id}`}
                className={`block truncate px-3 py-2.5 text-sm ${
                  currentEstimateId === e.id
                    ? "bg-slate-100 font-medium text-slate-800"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
                title={e.customerName || undefined}
              >
                {e.title || e.customerName || `견적 #${e.id}`}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* 채팅 영역 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="mb-2 flex flex-wrap items-center gap-2 text-xl font-semibold text-gray-900">
          <MessageCircle className="h-6 w-6 text-slate-600" />
          채팅
          {currentEstimateId != null && (
            <span className="text-base font-medium text-slate-600">· {currentRoomLabel}</span>
          )}
          {canShowNotificationUI && "Notification" in window && (
            <button
              type="button"
              onClick={() => {
                if (Notification.permission !== "granted") {
                  unlockAudio();
                  Notification.requestPermission().then((p) => setNotificationPermission(p));
                  return;
                }
                setAlarmMuted((m) => !m);
              }}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs ${
                notificationPermission !== "granted"
                  ? "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                  : alarmMuted
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
              title={
                notificationPermission !== "granted"
                  ? "알림 허용 (클릭 시 브라우저 알림 권한 요청)"
                  : alarmMuted
                    ? "클릭하면 알람 켜짐"
                    : "클릭하면 알람 끔"
              }
            >
              {notificationPermission !== "granted" ? (
                <Bell className="h-4 w-4" />
              ) : alarmMuted ? (
                <BellOff className="h-4 w-4" />
              ) : (
                <Bell className="h-4 w-4 fill-amber-400 text-amber-500" />
              )}
              {notificationPermission !== "granted"
                ? "알림 허용"
                : alarmMuted
                  ? "알람 끔"
                  : "알림 켜짐"}
            </button>
          )}
        </h1>
        <p className="mb-3 text-sm text-gray-500">
          견적별로 채팅방이 구분됩니다. 왼쪽에서 견적(견적명)을 선택하세요.
        </p>

        {!isValidRoom ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-500">
            유효하지 않은 채팅방입니다. 왼쪽에서 채팅방을 선택해 주세요.
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2">
              <label className="text-sm text-gray-600">이름:</label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder={companyName || "이름 입력"}
                className="max-w-[120px] rounded-lg border border-gray-300 px-2 py-1 text-sm"
              />
              <span className="text-xs text-gray-400">· {currentRoomLabel}</span>
            </div>

            <div
              ref={listRef}
              className="min-h-0 flex-1 overflow-y-auto p-3"
            >
              {loading ? (
                <p className="py-4 text-center text-sm text-gray-500">불러오는 중...</p>
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">이 채팅방에 메시지가 없습니다. 첫 메시지를 보내 보세요.</p>
              ) : (
                <ul className="space-y-3">
                  {messages.map((m) => (
                    <li key={m.id} className="flex flex-col">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium text-slate-600">{m.senderName}</span>
                        <span className="text-[10px] text-gray-400">
                          {m.createdAt ? format(new Date(m.createdAt), "MM/dd HH:mm", { locale: ko }) : ""}
                        </span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-words rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-800">
                        {m.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form onSubmit={handleSubmit} className="shrink-0 border-t border-gray-200 p-3">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="메시지 입력..."
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
                  aria-label="전송"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
