self.addEventListener("push", (event) => {
  const payload = (() => {
    if (!event.data) {
      return {
        title: "Habla Mas",
        body: "Tienes una notificacion nueva.",
        url: "/app",
        tag: "hablamas"
      };
    }

    try {
      return event.data.json();
    } catch {
      return {
        title: "Habla Mas",
        body: event.data.text() || "Tienes una notificacion nueva.",
        url: "/app",
        tag: "hablamas"
      };
    }
  })();

  event.waitUntil(
    self.registration.showNotification(payload.title || "Habla Mas", {
      body: payload.body || "Tienes una notificacion nueva.",
      data: {
        url: payload.url || "/app"
      },
      tag: payload.tag || "hablamas",
      renotify: false
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
