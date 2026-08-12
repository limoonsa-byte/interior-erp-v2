/**
 * 카톡형 Push 알림: OS 알림창으로 표시
 * - 해당 채팅방을 보고 있으면 알림 생략 (중복 방지)
 * - 클릭 시 채팅방으로 이동·포커스
 */
self.addEventListener("push", (event) => {
  let data = { title: "erp메세지", body: "", tag: "chat", url: "/chat", senderName: "" };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (_) {}
  }

  const title = (data.senderName && String(data.senderName).trim()) || data.title || "erp메세지";
  const body = data.body || "새 메시지가 도착했습니다.";
  const tag = data.tag || "chat";
  const targetUrl = data.url || "/chat";

  const options = {
    body,
    tag,
    renotify: true,
    silent: false,
    requireInteraction: false,
    icon: "/vercel.svg",
    badge: "/vercel.svg",
    data: { url: targetUrl, tag },
    vibrate: [120, 40, 120],
  };

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // 해당 채팅방을 이미 보고 있으면 OS 알림창은 띄우지 않음 (카톡과 동일)
      const viewingRoom = clientList.some((client) => {
        const visible = client.visibilityState === "visible" || client.focused;
        if (!visible) return false;
        try {
          const u = new URL(client.url);
          const path = u.pathname || "";
          if (!path.includes("/chat")) return false;
          const clientEid = u.searchParams.get("estimateId");
          const clientPeer = u.searchParams.get("peerPicId");
          try {
            const target = new URL(targetUrl, self.location.origin);
            const targetEid = target.searchParams.get("estimateId");
            const targetPeer = target.searchParams.get("peerPicId");
            if (targetPeer != null && targetPeer !== "") {
              return String(clientPeer) === String(targetPeer);
            }
            if (targetEid == null || targetEid === "") {
              return (clientEid == null || clientEid === "") && (clientPeer == null || clientPeer === "");
            }
            return String(clientEid) === String(targetEid) && (clientPeer == null || clientPeer === "");
          } catch {
            return true;
          }
        } catch {
          return false;
        }
      });

      if (viewingRoom) {
        // 보고 있는 탭에만 “새 메시지” 신호 (소리 등)
        for (const client of clientList) {
          try {
            client.postMessage({ type: "CHAT_MESSAGE_WHILE_VIEWING", tag, url: targetUrl });
          } catch (_) {}
        }
        return;
      }

      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || "/chat";
  const absoluteUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        try {
          const u = new URL(client.url);
          if (u.origin === self.location.origin && "focus" in client) {
            if ("navigate" in client) {
              return client.navigate(absoluteUrl).then((c) => (c && c.focus ? c.focus() : client.focus()));
            }
            return client.focus();
          }
        } catch (_) {}
      }
      if (self.clients.openWindow) return self.clients.openWindow(absoluteUrl);
    })
  );
});
