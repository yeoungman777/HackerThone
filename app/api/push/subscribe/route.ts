import { NextResponse } from 'next/server';
import { saveSubscription } from '@/lib/db';

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

/** 브라우저가 발급한 푸시 구독 정보를 저장한다. 저장하는 값에 URL은 절대 포함되지 않는다. */
export async function POST(request: Request) {
  let body: SubscribeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 });
  }

  try {
    const id = await saveSubscription(endpoint, p256dh, auth);
    return NextResponse.json({ subscriptionId: id });
  } catch (error) {
    console.error('푸시 구독 저장 실패:', error);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
