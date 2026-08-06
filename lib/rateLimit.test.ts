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
});
