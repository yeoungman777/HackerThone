// VirusTotal 조회 (PRD 3단계 = PRD 문서 2단계 "위협 데이터 수집").
// 서버는 대상 URL에 직접 접속하지 않는다 — VirusTotal API만 호출한다 (CLAUDE.md 절대 규칙 3).

import type { VirusTotalFacts } from '@/lib/types';

const VT_BASE = 'https://www.virustotal.com/api/v3';
// 무료 티어 레이트리밋(4회/분)을 지키기 위해 VT 호출 사이 최소 간격을 보장한다.
const MIN_REQUEST_INTERVAL_MS = 15_000;
// 처음 제출되는 URL은 VT 분석이 45초 안에 끝나지 않는 경우가 많아(15초 간격 제한과 겹치면
// 재시도가 2~3번밖에 안 됨) 매번 타임아웃으로 빠졌다. 75초로 늘려 5번 정도 재시도한다.
const ANALYSIS_POLL_TIMEOUT_MS = 75_000;

let lastRequestAt = 0;

async function throttledFetch(url: string, init: RequestInit): Promise<Response> {
  const waitMs = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  lastRequestAt = Date.now();
  return fetch(url, init);
}

function toUrlId(url: string): string {
  return Buffer.from(url, 'utf-8').toString('base64url').replace(/=+$/, '');
}

interface VtAttributes {
  last_analysis_stats?: {
    harmless?: number;
    malicious?: number;
    suspicious?: number;
    undetected?: number;
    timeout?: number;
  };
  categories?: Record<string, string>;
}

function attributesToFacts(attributes: VtAttributes | undefined): VirusTotalFacts {
  const stats = attributes?.last_analysis_stats ?? {};
  const malicious = stats.malicious ?? 0;
  const suspicious = stats.suspicious ?? 0;
  const harmless = stats.harmless ?? 0;
  const undetected = stats.undetected ?? 0;
  const timeout = stats.timeout ?? 0;
  const categories = attributes?.categories ? [...new Set(Object.values(attributes.categories))] : [];

  return {
    engines_total: malicious + suspicious + harmless + undetected + timeout,
    engines_malicious: malicious,
    engines_suspicious: suspicious,
    categories,
  };
}

/**
 * VirusTotal에서 URL 평판을 조회한다.
 * 기존 분석이 있으면 바로 반환하고, 없으면 제출 후 분석 완료까지 폴링한다.
 */
export async function fetchVirusTotalFacts(url: string): Promise<VirusTotalFacts> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) {
    throw new Error('VIRUSTOTAL_API_KEY가 설정되지 않았어요');
  }

  const headers = { 'x-apikey': apiKey };
  const urlId = toUrlId(url);

  const lookupRes = await throttledFetch(`${VT_BASE}/urls/${urlId}`, { headers });
  if (lookupRes.ok) {
    const body = (await lookupRes.json()) as { data: { attributes: VtAttributes } };
    return attributesToFacts(body.data.attributes);
  }
  if (lookupRes.status !== 404) {
    throw new Error(`VirusTotal 조회 실패 (${lookupRes.status})`);
  }

  const submitRes = await throttledFetch(`${VT_BASE}/urls`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ url }),
  });
  if (!submitRes.ok) {
    throw new Error(`VirusTotal 제출 실패 (${submitRes.status})`);
  }
  const submitBody = (await submitRes.json()) as { data: { id: string } };
  const analysisId = submitBody.data.id;

  const deadline = Date.now() + ANALYSIS_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const analysisRes = await throttledFetch(`${VT_BASE}/analyses/${analysisId}`, { headers });
    if (!analysisRes.ok) {
      throw new Error(`VirusTotal 분석 조회 실패 (${analysisRes.status})`);
    }
    const analysisBody = (await analysisRes.json()) as {
      data: { attributes: { status: string; stats?: VtAttributes['last_analysis_stats'] } };
    };
    if (analysisBody.data.attributes.status === 'completed') {
      // categories는 analysis 응답에 없으므로 url 리포트를 다시 조회한다.
      const finalRes = await throttledFetch(`${VT_BASE}/urls/${urlId}`, { headers });
      if (finalRes.ok) {
        const finalBody = (await finalRes.json()) as { data: { attributes: VtAttributes } };
        return attributesToFacts(finalBody.data.attributes);
      }
      return attributesToFacts({ last_analysis_stats: analysisBody.data.attributes.stats });
    }
  }

  throw new Error('VirusTotal 분석 대기 시간을 초과했어요');
}
