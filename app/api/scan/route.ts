import { NextResponse } from 'next/server';
import { normalizeUrl } from '@/lib/normalize';
import { fetchVirusTotalFacts } from '@/lib/providers/virustotal';
import { fetchUrlscanFacts } from '@/lib/providers/urlscan';
import type { ScanFacts, ScanResult } from '@/lib/types';

// urlscan.io 폴링(최대 60초)을 안전하게 기다리기 위해 함수 실행 시간을 넉넉히 확보한다.
export const maxDuration = 90;

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
    // TODO(다음 단계): lib/score.ts에서 브랜드 유사 도메인 휴리스틱으로 채운다.
    brand_impersonation_hint: null,
  };

  // TODO(다음 단계): lib/score.ts(위험도 산출) + lib/llm.ts(서사 설명)로 대체한다.
  const mockResult: ScanResult = {
    facts,
    score: {
      total: 0,
      verdict: 'safe',
      signals: [],
    },
    explanation: {
      summary: '아직 실제 판정 결과가 아니에요',
      story: '위협 데이터 수집까지는 연결됐고, 점수 산출과 설명 생성은 다음 단계에서 연결돼요.',
      evidence: [],
      tips: [],
    },
    partial,
  };

  return NextResponse.json(mockResult);
}
