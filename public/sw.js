// 위험한 사이트 감지 푸시 알림을 화면에 띄우는 역할만 한다.
self.addEventListener("push", (event) => {
  let data = { title: "CheckLink", body: "새 알림이 있어요" };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // ignore malformed payload
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.jpg",
      badge: "/icon.jpg",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/"));
});
