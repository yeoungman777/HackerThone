import { NextResponse } from 'next/server';
import { normalizeUrl } from '@/lib/normalize';
import { fetchVirusTotalFacts } from '@/lib/providers/virustotal';
import { fetchUrlscanFacts, UrlscanUnreachableError } from '@/lib/providers/urlscan';
import { calculateScore, detectBrandImpersonationHint, detectHarmfulContentHint } from '@/lib/score';
import { generateExplanation } from '@/lib/llm';
import { createRateLimiter } from '@/lib/rateLimit';
import type { ScanFacts, ScanResult } from '@/lib/types';

// urlscan.io 폴링(최대 60초)과 VirusTotal 폴링(최대 75초, 병렬 실행)에 이어지는
// LLM 호출까지 안전하게 마칠 수 있도록 함수 실행 시간을 넉넉히 확보한다.
export const maxDuration = 120;

// 동일 IP당 분당 5회. Vercel 서버리스 인스턴스마다 상태가 분리돼 완벽하진 않지만
// 없는 것보다는 낫다 (PRD 7.1).
const scanRateLimiter = createRateLimiter(5, 60_000);

/** 검사 결과는 개인정보(URL)를 포함하므로 어떤 캐시에도 저장되지 않게 한다 (PRD 7.3). */
function jsonNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return 'unknown';
}

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  if (scanRateLimiter.isLimited(clientIp)) {
    return jsonNoStore({ error: 'rate_limited' }, 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ error: 'invalid_body' }, 400);
  }

  const rawUrl =
    typeof body === 'object' && body !== null && typeof (body as { url?: unknown }).url === 'string'
      ? (body as { url: string }).url
      : '';

  const normalized = normalizeUrl(rawUrl);
  if (!normalized.ok) {
    return jsonNoStore({ error: normalized.reason }, 400);
  }

  // 사용자가 입력한 URL 원문은 로그로 남기지 않는다 (PRD 7.3). 에러 로그에는
  // 진단에 필요한 최소한의 정보인 hostname만 남긴다.
  const hostname = new URL(normalized.url).hostname;

  // VirusTotal(정적 대조)과 urlscan.io(격리 브라우저 접속)는 병렬로 조회한다.
  // 서버는 대상 URL에 직접 fetch하지 않는다 — 두 API가 접속을 대행한다.
  const [virustotalSettled, urlscanSettled] = await Promise.allSettled([
    fetchVirusTotalFacts(normalized.url),
    fetchUrlscanFacts(normalized.url),
  ]);

  const virustotal = virustotalSettled.status === 'fulfilled' ? virustotalSettled.value : null;
  const urlscan = urlscanSettled.status === 'fulfilled' ? urlscanSettled.value : null;
  const partial = virustotalSettled.status === 'rejected' || urlscanSettled.status === 'rejected';

  if (virustotalSettled.status === 'rejected') {
    console.error(`VirusTotal 조회 실패 (host: ${hostname}):`, virustotalSettled.reason);
  }
  if (urlscanSettled.status === 'rejected') {
    console.error(`urlscan.io 조회 실패 (host: ${hostname}):`, urlscanSettled.reason);
  }

  // 둘 다 실패하면 근거가 하나도 없는 채로 점수를 계산해 "안전"으로 잘못 응답할 수 있다
  // (PRD 7.4 "둘 다 실패" 케이스). 이 경우 판정 자체를 내지 않고 에러로 응답한다.
  if (virustotalSettled.status === 'rejected' && urlscanSettled.status === 'rejected') {
    return jsonNoStore({ error: 'scan_unavailable' }, 503);
  }

  const targetUnreachable =
    urlscanSettled.status === 'rejected' && urlscanSettled.reason instanceof UrlscanUnreachableError;

  const facts: ScanFacts = {
    url_normalized: normalized.url,
    domain: hostname,
    domain_age_days: urlscan?.domain_age_days ?? null,
    tld: hostname.split('.').pop() ?? '',
    uses_https: normalized.url.startsWith('https://'),
    virustotal,
    urlscan,
    brand_impersonation_hint: detectBrandImpersonationHint(hostname),
    harmful_content_hint: detectHarmfulContentHint(virustotal?.categories ?? []),
    target_unreachable: targetUnreachable,
  };

  // 판정은 코드가 계산한다 — LLM에게 "위험한가?"를 묻지 않는다 (CLAUDE.md 절대 규칙 1).
  const score = calculateScore(facts);
  const explanation = await generateExplanation(facts, score);

  const result: ScanResult = { facts, score, explanation, partial };

  return jsonNoStore(result, 200);
}
