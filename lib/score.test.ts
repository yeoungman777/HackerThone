import { describe, expect, it } from 'vitest';
import { calculateScore, detectBrandImpersonationHint } from './score';
import type { ScanFacts } from './types';

function makeFacts(overrides: Partial<ScanFacts> = {}): ScanFacts {
  return {
    url_normalized: 'https://example.com/',
    domain: 'example.com',
    domain_age_days: 3650,
    tld: 'com',
    uses_https: true,
    virustotal: { engines_total: 70, engines_malicious: 0, engines_suspicious: 0, categories: [] },
    urlscan: {
      final_url: 'https://example.com/',
      redirect_count: 0,
      redirect_chain: [],
      has_password_input: false,
      external_domains_contacted: 0,
      screenshot_url: null,
      page_title: null,
      domain_age_days: 3650,
      server_country: null,
    },
    brand_impersonation_hint: null,
    ...overrides,
  };
}

describe('calculateScore', () => {
  it('신호가 하나도 없으면 안전으로 판정한다', () => {
    const result = calculateScore(makeFacts());
    expect(result.total).toBe(0);
    expect(result.verdict).toBe('safe');
    expect(result.signals).toHaveLength(0);
  });

  it('악성 엔진 1개 이상이면 +40점을 부여한다', () => {
    const result = calculateScore(
      makeFacts({ virustotal: { engines_total: 70, engines_malicious: 1, engines_suspicious: 0, categories: [] } })
    );
    expect(result.total).toBe(40);
    expect(result.verdict).toBe('caution');
  });

  it('악성 엔진 3개 이상이면 40점에 30점이 누적된다', () => {
    const result = calculateScore(
      makeFacts({ virustotal: { engines_total: 70, engines_malicious: 3, engines_suspicious: 0, categories: [] } })
    );
    expect(result.total).toBe(70);
    expect(result.verdict).toBe('danger');
  });

  it('도메인 생성 30일 이내면 +20점을 부여한다', () => {
    const result = calculateScore(makeFacts({ domain_age_days: 30 }));
    expect(result.total).toBe(20);
    expect(result.verdict).toBe('caution');
  });

  it('도메인 생성 31일이면 신호가 발생하지 않는다', () => {
    const result = calculateScore(makeFacts({ domain_age_days: 31 }));
    expect(result.total).toBe(0);
  });

  it('비밀번호 입력칸 + 브랜드 유사 도메인이면 +25점을 부여한다', () => {
    const result = calculateScore(
      makeFacts({
        domain: 'instagram-verify-login.xyz',
        brand_impersonation_hint: 'instagram',
        urlscan: {
          final_url: 'https://instagram-verify-login.xyz/',
          redirect_count: 0,
          redirect_chain: [],
          has_password_input: true,
          external_domains_contacted: 0,
          screenshot_url: null,
          page_title: null,
          domain_age_days: 3650,
          server_country: null,
        },
      })
    );
    expect(result.total).toBe(25);
  });

  it('비밀번호 입력칸만 있고 브랜드 힌트가 없으면 신호가 발생하지 않는다', () => {
    const result = calculateScore(
      makeFacts({
        urlscan: {
          final_url: 'https://example.com/',
          redirect_count: 0,
          redirect_chain: [],
          has_password_input: true,
          external_domains_contacted: 0,
          screenshot_url: null,
          page_title: null,
          domain_age_days: 3650,
          server_country: null,
        },
      })
    );
    expect(result.total).toBe(0);
  });

  it('HTTPS를 사용하지 않으면 +10점을 부여한다', () => {
    const result = calculateScore(makeFacts({ uses_https: false }));
    expect(result.total).toBe(10);
  });

  it('리다이렉트 3회 이상이면 +10점을 부여한다', () => {
    const result = calculateScore(
      makeFacts({
        urlscan: {
          final_url: 'https://example.com/',
          redirect_count: 3,
          redirect_chain: ['a.com', 'b.com', 'c.com'],
          has_password_input: false,
          external_domains_contacted: 0,
          screenshot_url: null,
          page_title: null,
          domain_age_days: 3650,
          server_country: null,
        },
      })
    );
    expect(result.total).toBe(10);
  });

  it('판정 경계값: 10점은 safe, 20점(https 미사용 + 리다이렉트 3회)은 caution이다', () => {
    expect(calculateScore(makeFacts({ uses_https: false })).total).toBe(10);
    expect(calculateScore(makeFacts({ uses_https: false })).verdict).toBe('safe');

    const twentyPoints = calculateScore(
      makeFacts({
        uses_https: false,
        urlscan: {
          final_url: 'https://example.com/',
          redirect_count: 3,
          redirect_chain: ['a.com', 'b.com', 'c.com'],
          has_password_input: false,
          external_domains_contacted: 0,
          screenshot_url: null,
          page_title: null,
          domain_age_days: 3650,
          server_country: null,
        },
      })
    );
    expect(twentyPoints.total).toBe(20);
    expect(twentyPoints.verdict).toBe('caution');
  });

  it('판정 경계값: 49점은 caution, 50점은 danger이다', () => {
    // 20(도메인) + 25(비밀번호+브랜드) = 45 → caution
    const caution = calculateScore(
      makeFacts({
        domain_age_days: 30,
        domain: 'instagram-verify-login.xyz',
        brand_impersonation_hint: 'instagram',
        urlscan: {
          final_url: 'https://instagram-verify-login.xyz/',
          redirect_count: 0,
          redirect_chain: [],
          has_password_input: true,
          external_domains_contacted: 0,
          screenshot_url: null,
          page_title: null,
          domain_age_days: 30,
          server_country: null,
        },
      })
    );
    expect(caution.total).toBe(45);
    expect(caution.verdict).toBe('caution');

    // 위와 동일 + 악성 엔진 1개(+40) = 85 → danger
    const danger = calculateScore(
      makeFacts({
        domain_age_days: 30,
        domain: 'instagram-verify-login.xyz',
        brand_impersonation_hint: 'instagram',
        virustotal: { engines_total: 70, engines_malicious: 1, engines_suspicious: 0, categories: [] },
        urlscan: {
          final_url: 'https://instagram-verify-login.xyz/',
          redirect_count: 0,
          redirect_chain: [],
          has_password_input: true,
          external_domains_contacted: 0,
          screenshot_url: null,
          page_title: null,
          domain_age_days: 30,
          server_country: null,
        },
      })
    );
    expect(danger.total).toBe(85);
    expect(danger.verdict).toBe('danger');
  });

  it('데이터가 없거나(null/undefined) 조회 실패한 필드는 신호를 만들지 않는다', () => {
    const result = calculateScore(makeFacts({ virustotal: null, urlscan: null, domain_age_days: null }));
    expect(result.total).toBe(0);
    expect(result.verdict).toBe('safe');
  });
});

describe('detectBrandImpersonationHint', () => {
  it('브랜드명을 포함하지만 공식 도메인이 아니면 브랜드명을 반환한다', () => {
    expect(detectBrandImpersonationHint('instagram-verify-login.xyz')).toBe('instagram');
  });

  it('공식 도메인이면 null을 반환한다', () => {
    expect(detectBrandImpersonationHint('instagram.com')).toBeNull();
  });

  it('공식 도메인의 서브도메인이면 null을 반환한다', () => {
    expect(detectBrandImpersonationHint('help.instagram.com')).toBeNull();
  });

  it('알려진 브랜드명을 포함하지 않으면 null을 반환한다', () => {
    expect(detectBrandImpersonationHint('example.com')).toBeNull();
  });
});
