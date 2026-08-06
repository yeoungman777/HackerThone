// urlscan.io가 대형 사이트(유튜브·구글 등)를 정책적으로 차단해 실패했을 때만 쓰는 보조 스크린샷 조회.
// urlscan.io와 마찬가지로 우리 서버가 아니라 microlink.io가 대상 URL에 접속한다 (CLAUDE.md 절대 규칙 3).
// API 키 없이도 기본 요청을 처리해준다.

const MICROLINK_BASE = 'https://api.microlink.io';
const TIMEOUT_MS = 20_000;

interface MicrolinkResponse {
  status: 'success' | 'fail';
  data?: { screenshot?: { url: string } };
}

/** urlscan.io가 실패했을 때만 호출하는 보조 스크린샷 조회. 실패해도 예외를 던지지 않고 null을 반환한다. */
export async function fetchFallbackScreenshot(url: string): Promise<string | null> {
  const params = new URLSearchParams({
    url,
    screenshot: 'true',
    // meta:true를 켜면 microlink가 자체적으로 안티봇 차단(예: "Sign in to confirm you're not
    // a bot")을 감지해 status:fail로 응답해준다 — 그 덕에 봇 차단 화면을 실제 스크린샷인 것처럼
    // 보여주는 대신 아예 실패로 처리하고 텍스트 안내로 대체할 수 있다.
    meta: 'true',
    // 유튜브처럼 무거운 페이지는 전체 로드(load 이벤트)를 기다리면 타임아웃 나기 쉬워
    // DOM만 그려지면 바로 캡처하도록 한다.
    waitUntil: 'domcontentloaded',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${MICROLINK_BASE}/?${params.toString()}`, { signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as MicrolinkResponse;
    if (body.status !== 'success') return null;
    return body.data?.screenshot?.url ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
