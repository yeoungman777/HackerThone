// urlscan.io 제출 + 폴링 (PRD 3단계 = PRD 문서 2단계 "위협 데이터 수집").
// 격리된 가상 브라우저로 실제 접속하는 주체는 urlscan.io이며, 우리 서버는
// 대상 URL에 직접 fetch하지 않는다 (CLAUDE.md 절대 규칙 3).

import type { UrlscanFacts } from '@/lib/types';

const URLSCAN_BASE = 'https://urlscan.io/api/v1';
const POLL_INTERVAL_MS = 2_000;
const MAX_WAIT_MS = 60_000;

interface SubmitResponse {
  uuid: string;
  api: string;
}

interface UrlscanResult {
  task: {
    url: string;
    screenshotURL: string;
    domURL: string;
  };
  page?: {
    url?: string;
    domain?: string;
    title?: string | null;
    country?: string | null;
    domainAgeDays?: number | null;
  };
  lists?: {
    domains?: string[];
  };
  data?: {
    redirects?: { from: string; to: string; status: number }[];
  };
}

async function submitScan(url: string, apiKey: string): Promise<SubmitResponse> {
  const submit = async (visibility: 'private' | 'public') =>
    fetch(`${URLSCAN_BASE}/scan/`, {
      method: 'POST',
      headers: { 'API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, visibility }),
    });

  let res = await submit('private');
  if (!res.ok) {
    // private 스캔 한도 소진 등으로 실패하면 public으로 폴백한다.
    res = await submit('public');
  }
  if (!res.ok) {
    throw new Error(`urlscan 제출 실패 (${res.status})`);
  }
  return res.json();
}

async function pollResult(api: string, apiKey: string): Promise<UrlscanResult> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(api, { headers: { 'API-Key': apiKey } });
    if (res.status === 200) {
      return res.json();
    }
    if (res.status !== 404) {
      throw new Error(`urlscan 결과 조회 실패 (${res.status})`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('urlscan 스캔 대기 시간을 초과했어요');
}

/** 스캔된 페이지의 DOM에 비밀번호 입력 필드가 있는지 확인한다. DOM 원문은 LLM에 전달하지 않는다. */
async function detectPasswordInput(domUrl: string, apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(domUrl, { headers: { 'API-Key': apiKey } });
    if (!res.ok) return false;
    const dom = await res.text();
    return /type=["']?password/i.test(dom);
  } catch {
    return false;
  }
}

function toHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function extractFacts(result: UrlscanResult, apiKey: string): Promise<UrlscanFacts> {
  const finalUrl = result.page?.url ?? result.task.url;
  const finalDomain = result.page?.domain ?? toHostname(finalUrl) ?? '';

  const redirects = result.data?.redirects ?? [];
  const redirectChain = redirects
    .map((r) => toHostname(r.to))
    .filter((host): host is string => Boolean(host));

  const contactedDomains = new Set(result.lists?.domains ?? []);
  contactedDomains.delete(finalDomain);

  const hasPasswordInput = await detectPasswordInput(result.task.domURL, apiKey);

  return {
    final_url: finalUrl,
    redirect_count: redirects.length,
    redirect_chain: redirectChain,
    has_password_input: hasPasswordInput,
    external_domains_contacted: contactedDomains.size,
    screenshot_url: result.task.screenshotURL ?? null,
    page_title: result.page?.title || null,
    domain_age_days: result.page?.domainAgeDays ?? null,
    server_country: result.page?.country || null,
  };
}

/** urlscan.io에 스캔을 제출하고 결과가 준비될 때까지 폴링한다. */
export async function fetchUrlscanFacts(url: string): Promise<UrlscanFacts> {
  const apiKey = process.env.URLSCAN_API_KEY;
  if (!apiKey) {
    throw new Error('URLSCAN_API_KEY가 설정되지 않았어요');
  }

  const submitted = await submitScan(url, apiKey);
  const result = await pollResult(submitted.api, apiKey);
  return extractFacts(result, apiKey);
}
