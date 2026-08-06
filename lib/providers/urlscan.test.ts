import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchUrlscanFacts, UrlscanUnreachableError } from './urlscan';

const ORIGINAL_ENV = process.env.URLSCAN_API_KEY;

beforeEach(() => {
  process.env.URLSCAN_API_KEY = 'test-key';
});

afterEach(() => {
  process.env.URLSCAN_API_KEY = ORIGINAL_ENV;
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('fetchUrlscanFacts', () => {
  it('DNS 조회 실패로 제출이 거부되면 UrlscanUnreachableError를 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        message: 'Invalid URL',
        description: 'DNS Error - Could not resolve domain',
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchUrlscanFacts('https://this-domain-does-not-exist.example/')).rejects.toBeInstanceOf(
      UrlscanUnreachableError
    );

    // private 제출 실패 후 public으로 한 번 더 재시도하므로 최소 2번 호출된다.
    expect(fetchMock).toHaveBeenCalled();
  });

  it('DNS 오류가 아닌 400 응답은 일반 에러로 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, { message: 'Malformed request', description: 'invalid visibility value' })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchUrlscanFacts('https://example.com/')).rejects.toThrow('urlscan 제출 실패');
  });

  it('다른 상태 코드의 실패는 일반 에러로 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchUrlscanFacts('https://example.com/')).rejects.toThrow('urlscan 제출 실패 (429)');
  });
});
