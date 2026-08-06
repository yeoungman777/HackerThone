import { NextResponse } from 'next/server';
import { normalizeUrl } from '@/lib/normalize';
import type { ScanResult } from '@/lib/types';

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

  // TODO(다음 단계): virustotal.ts / urlscan.ts 병렬 조회로 목 데이터를 대체한다.
  const hostname = new URL(normalized.url).hostname;
  const mockResult: ScanResult = {
    facts: {
      url_normalized: normalized.url,
      domain: hostname,
      domain_age_days: null,
      tld: hostname.split('.').pop() ?? '',
      uses_https: normalized.url.startsWith('https://'),
      virustotal: null,
      urlscan: null,
      brand_impersonation_hint: null,
    },
    score: {
      total: 0,
      verdict: 'safe',
      signals: [],
    },
    explanation: {
      summary: '아직 실제 검사 결과가 아니에요',
      story: '지금은 개발 중인 임시 데이터예요. 실제 위협 데이터 수집은 다음 단계에서 연결돼요.',
      evidence: [],
      tips: [],
    },
    partial: true,
  };

  return NextResponse.json(mockResult);
}
