// 인메모리 슬라이딩 윈도우 레이트리밋 (PRD 7.1 확장 — 동일 IP의 과도한 요청 방지).
// Vercel 서버리스는 인스턴스마다 메모리가 분리돼 완벽하게 막지는 못하지만,
// 없는 것보다는 낫다.

export interface RateLimiter {
  isLimited(key: string): boolean;
}

export function createRateLimiter(maxRequests: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    isLimited(key: string): boolean {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
      recent.push(now);
      hits.set(key, recent);
      return recent.length > maxRequests;
    },
  };
}
