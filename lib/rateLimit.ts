// 인메모리 슬라이딩 윈도우 레이트리밋 (PRD 7.1 확장 — 동일 IP의 과도한 요청 방지).
// Vercel 서버리스는 인스턴스마다 메모리가 분리돼 완벽하게 막지는 못하지만,
// 없는 것보다는 낫다.
//
// 요청이 뜸해진 키(IP)를 그냥 두면 인스턴스가 오래 켜져 있는 동안 Map이 계속
// 자란다. 추적 중인 키 수가 임계치를 넘으면 완전히 만료된 키만 정리한다.

export interface RateLimiter {
  isLimited(key: string): boolean;
  /** 현재 추적 중인 키(IP) 개수. 테스트·디버깅용. */
  size(): number;
}

const DEFAULT_MAX_TRACKED_KEYS = 5000;

export function createRateLimiter(
  maxRequests: number,
  windowMs: number,
  maxTrackedKeys: number = DEFAULT_MAX_TRACKED_KEYS
): RateLimiter {
  const hits = new Map<string, number[]>();

  function sweepExpired(now: number): void {
    for (const [key, timestamps] of hits) {
      const allExpired = timestamps.every((timestamp) => now - timestamp >= windowMs);
      if (allExpired) {
        hits.delete(key);
      }
    }
  }

  return {
    isLimited(key: string): boolean {
      const now = Date.now();
      if (hits.size > maxTrackedKeys) {
        sweepExpired(now);
      }

      const recent = (hits.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
      recent.push(now);
      hits.set(key, recent);
      return recent.length > maxRequests;
    },
    size(): number {
      return hits.size;
    },
  };
}
