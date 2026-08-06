import { NextResponse } from 'next/server';
import { deleteSubscription } from '@/lib/db';

/** 알림을 끌 때 저장해둔 구독 정보를 지운다. */
export async function POST(request: Request) {
  let body: { subscriptionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!body.subscriptionId) {
    return NextResponse.json({ error: 'missing_subscription_id' }, { status: 400 });
  }

  try {
    await deleteSubscription(body.subscriptionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('푸시 구독 삭제 실패:', error);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }
}
