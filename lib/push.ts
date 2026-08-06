// 웹 푸시 발송. verdict가 danger일 때만 호출된다 (app/api/scan/route.ts).
// 알림 문구는 고정 — LLM을 거치지 않는다 (판정 문구와 마찬가지로 표현이 매번 달라지면 안 된다).

import webpush from 'web-push';
import { deleteSubscription, findSubscription } from './db';

const DANGER_NOTIFICATION = {
  title: '위험한 사이트가 감지됐어요',
  body: '위험한 사이트를 받거나 찾으신 거 같네요, 궁금해도 들어가지 않는 게 안전해요',
};

function isConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
  );
}

/**
 * 저장된 구독 id로 "위험한 사이트 감지" 푸시를 보낸다. 이 함수는 예외를 던지지 않는다 —
 * 알림 발송 실패가 검사 결과 응답 자체를 막아서는 안 된다. 구독이 더 이상 유효하지
 * 않다면(브라우저가 알림을 껐거나 만료됨) 조용히 DB에서 지운다.
 */
export async function sendDangerNotification(subscriptionId: string): Promise<void> {
  if (!isConfigured()) {
    console.error('VAPID 키가 설정되지 않았어요. 푸시 알림을 건너뜁니다.');
    return;
  }

  try {
    const subscription = await findSubscription(subscriptionId);
    if (!subscription) return;

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(DANGER_NOTIFICATION)
    );
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      // 구독이 만료됐거나 브라우저에서 해제됨 — 더 이상 쓸모없으니 정리한다.
      await deleteSubscription(subscriptionId).catch(() => undefined);
      return;
    }
    console.error('푸시 알림 발송 실패:', error);
  }
}
