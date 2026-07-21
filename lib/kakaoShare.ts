/** 카카오톡 공유 SDK (붙여넣기 없이 친구 선택 → 전송) */

type KakaoShare = {
  isInitialized: () => boolean;
  init: (key: string) => void;
  Share: {
    sendDefault: (options: Record<string, unknown>) => void;
  };
};

declare global {
  interface Window {
    Kakao?: KakaoShare;
  }
}

function loadKakaoSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("브라우저에서만 사용할 수 있습니다."));
  if (window.Kakao) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-kakao-sdk="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("카카오 SDK 로드 실패")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
    script.async = true;
    script.dataset.kakaoSdk = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("카카오 SDK 로드 실패"));
    document.head.appendChild(script);
  });
}

export async function ensureKakaoReady(jsKey: string): Promise<void> {
  await loadKakaoSdk();
  const Kakao = window.Kakao;
  if (!Kakao) throw new Error("카카오 SDK를 불러오지 못했습니다.");
  if (!Kakao.isInitialized()) {
    Kakao.init(jsKey);
  }
}

export async function shareScheduleViaKakao(params: {
  title: string;
  description: string;
  fullText: string;
}): Promise<void> {
  const Kakao = window.Kakao;
  if (!Kakao?.Share) throw new Error("카카오 공유를 사용할 수 없습니다.");

  const origin = typeof window !== "undefined" ? window.location.origin : "https://developers.kakao.com";
  // text 템플릿은 link 필수. 앱 도메인이 카카오 앱에 등록되어 있어야 함.
  Kakao.Share.sendDefault({
    objectType: "text",
    text: params.fullText.slice(0, 200),
    link: {
      mobileWebUrl: origin,
      webUrl: origin,
    },
    buttonTitle: "일정 확인",
  });
}
