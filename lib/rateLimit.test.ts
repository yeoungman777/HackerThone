import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from './rateLimit';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createRateLimiter', () => {
  it('한도 이내 요청은 막지 않는다', () => {
    const limiter = createRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(limiter.isLimited('1.2.3.4')).toBe(false);
    }
  });

  it('한도를 넘는 요청은 막는다', () => {
    const limiter = createRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      limiter.isLimited('1.2.3.4');
    }
    expect(limiter.isLimited('1.2.3.4')).toBe(true);
  });

  it('다른 키(IP)는 독립적으로 집계한다', () => {
    const limiter = createRateLimiter(1, 60_000);
    expect(limiter.isLimited('1.1.1.1')).toBe(false);
    expect(limiter.isLimited('2.2.2.2')).toBe(false);
    expect(limiter.isLimited('1.1.1.1')).toBe(true);
  });

  it('시간 창이 지나면 다시 허용한다', () => {
    const limiter = createRateLimiter(1, 60_000);
    expect(limiter.isLimited('1.2.3.4')).toBe(false);
    expect(limiter.isLimited('1.2.3.4')).toBe(true);

    vi.advanceTimersByTime(60_001);

    expect(limiter.isLimited('1.2.3.4')).toBe(false);
  });

  it('추적 키 수가 임계치를 넘고 오래된 키가 있으면 정리해 메모리가 무한정 늘어나지 않는다', () => {
    const limiter = createRateLimiter(5, 60_000, 1);
    limiter.isLimited('a');
    limiter.isLimited('b');
    expect(limiter.size()).toBe(2);

    vi.advanceTimersByTime(60_001);

    // 이 호출 시점에 size(2) > maxTrackedKeys(1)이므로 정리가 일어나고,
    // a·b는 둘 다 만료됐으므로 지워진 뒤 c만 남는다.
    limiter.isLimited('c');
    expect(limiter.size()).toBe(1);
  });

  it('아직 만료되지 않은 키는 정리 대상에서 제외한다', () => {
    const limiter = createRateLimiter(5, 60_000, 1);
    limiter.isLimited('a');
    vi.advanceTimersByTime(30_000);
    limiter.isLimited('b');

    // size(2) > maxTrackedKeys(1)이므로 정리가 시도되지만, a는 30초밖에 안
    // 지나 아직 유효해서 지워지지 않는다.
    limiter.isLimited('c');
    expect(limiter.size()).toBe(3);
  });
});
