"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "checklink:push-subscription-id";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export default function PushNotificationToggle() {
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
    );
    setSubscriptionId(localStorage.getItem(STORAGE_KEY));
  }, []);

  async function enable() {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setLoading(false);
        return;
      }

      await navigator.serviceWorker.register("/sw.js");
      // register()는 등록이 "시작"되면 바로 resolve된다 — 아직 install/activate 전이라
      // pushManager.subscribe()가 "no active Service Worker"로 실패할 수 있다. ready는
      // 실제로 활성화된 뒤에 resolve되므로 이걸 기다린다.
      const registration = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setLoading(false);
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const json = subscription.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      const body = (await res.json()) as { subscriptionId?: string };
      if (body.subscriptionId) {
        localStorage.setItem(STORAGE_KEY, body.subscriptionId);
        setSubscriptionId(body.subscriptionId);
      }
    } catch (error) {
      console.error("알림 구독에 실패했어요:", error);
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    if (!subscriptionId) return;
    setLoading(true);
    try {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      const registration = await navigator.serviceWorker.getRegistration();
      const existing = await registration?.pushManager.getSubscription();
      await existing?.unsubscribe();
    } catch (error) {
      console.error("알림 해제에 실패했어요:", error);
    } finally {
      localStorage.removeItem(STORAGE_KEY);
      setSubscriptionId(null);
      setLoading(false);
    }
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={subscriptionId ? disable : enable}
      disabled={loading}
      className="text-xs text-foreground/40 underline underline-offset-4 disabled:opacity-50"
    >
      {subscriptionId ? "위험 사이트 알림 끄기" : "위험한 사이트 알림 받기"}
    </button>
  );
}
