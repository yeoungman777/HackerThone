import { NextResponse } from 'next/server';
import { normalizeUrl } from '@/lib/normalize';
import { fetchVirusTotalFacts } from '@/lib/providers/virustotal';
import { fetchUrlscanFacts } from '@/lib/providers/urlscan';
import { calculateScore, detectBrandImpersonationHint } from '@/lib/score';
import { generateExplanation } from '@/lib/llm';
import type { ScanFacts, ScanResult } from '@/lib/types';

// urlscan.io 폴링(최대 60초)과 VirusTotal 폴링(최대 75초, 병렬 실행)에 이어지는
// LLM 호출까지 안전하게 마칠 수 있도록 함수 실행 시간을 넉넉히 확보한다.
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const rawUrl =
    typeof body === 'object' && body !== null && typeof (body as { url?: unknown }).url === 'string'
      ? (body as { url: string }).url
      : '';

  const normalized = normalizeUrl(rawUrl);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.reason }, { status: 400 });
  }

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
    console.error('VirusTotal 조회 실패:', virustotalSettled.reason);
  }
  if (urlscanSettled.status === 'rejected') {
    console.error('urlscan.io 조회 실패:', urlscanSettled.reason);
  }

  const facts: ScanFacts = {
    url_normalized: normalized.url,
    domain: hostname,
    domain_age_days: urlscan?.domain_age_days ?? null,
    tld: hostname.split('.').pop() ?? '',
    uses_https: normalized.url.startsWith('https://'),
    virustotal,
    urlscan,
    brand_impersonation_hint: detectBrandImpersonationHint(hostname),
  };

  // 판정은 코드가 계산한다 — LLM에게 "위험한가?"를 묻지 않는다 (CLAUDE.md 절대 규칙 1).
  const score = calculateScore(facts);
  const explanation = await generateExplanation(facts, score);

  const result: ScanResult = { facts, score, explanation, partial };

  return NextResponse.json(result);
}
