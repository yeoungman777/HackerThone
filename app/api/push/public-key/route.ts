import { NextResponse } from 'next/server';

// VAPID 공개키를 빌드 타임에 클라이언트 번들에 박아 넣는(NEXT_PUBLIC_*) 대신 런타임에
// 내려준다. 배포 환경에 따라 NEXT_PUBLIC_* 값이 빌드 시점에 제대로 주입되지 않는 경우가
// 있었는데, 서버 쪽 환경변수는 요청 시점에 항상 정확히 읽히므로 이 방식이 더 안정적이다.
export async function GET() {
  // 변수 이름 자체는 그대로 두되(NEXT_PUBLIC_ 접두어는 서버 코드에서 읽는 데는 영향 없다),
  // 클라이언트 번들에 빌드 타임으로 박아 넣지 않고 이 라우트로만 전달한다.
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
  return NextResponse.json({ publicKey });
}
