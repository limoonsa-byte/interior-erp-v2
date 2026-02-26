/**
 * Push 이벤트: 채팅 새 메시지 알림 (다른 탭/백그라운드에서도 수신)
 */
self.addEventListener("push", (event) => {
  let data = { title: "뾰로롱", body: "" };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (_) {}
  }
  const options = {
    body: data.body || "새 메시지가 도착했습니다.",
    tag: data.tag || "chat",
    data: { url: data.url || "/chat" },
    requireInteraction: false,
  };
  event.waitUntil(
    self.registration.showNotification(data.title || "뾰로롱", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/chat";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
