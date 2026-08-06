import { describe, expect, it } from 'vitest';
import { buildFallbackExplanation } from './llm';
import { calculateScore } from './score';
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
    harmful_content_hint: null,
    ...overrides,
  };
}

describe('buildFallbackExplanation', () => {
  it('verdict가 content_restricted이면 콘텐츠 전용 문구를 반환한다', () => {
    const facts = makeFacts({ harmful_content_hint: '사설 도박' });
    const score = calculateScore(facts);
    expect(score.verdict).toBe('content_restricted');

    const explanation = buildFallbackExplanation(facts, score);

    expect(explanation.summary).toContain('사설 도박');
    expect(explanation.story).toContain('사설 도박');
    expect(explanation.story).toContain('계정이 털리는 것과는 다르지만');
    expect(explanation.evidence).toHaveLength(score.signals.length);
  });

  it('악성 엔진 탐지 + 유해 콘텐츠가 함께 있으면 danger 기본 문구를 쓴다', () => {
    const facts = makeFacts({
      harmful_content_hint: '사설 도박',
      virustotal: { engines_total: 70, engines_malicious: 1, engines_suspicious: 0, categories: [] },
    });
    const score = calculateScore(facts);
    expect(score.verdict).toBe('danger');

    const explanation = buildFallbackExplanation(facts, score);

    expect(explanation.summary).toBe('위험한 링크로 확인됐어요');
    expect(explanation.evidence.some((item) => item.text.includes('사설 도박'))).toBe(true);
  });

  it('비밀번호 입력칸/브랜드 사칭 + 유해 콘텐츠가 함께 있으면 danger 기본 문구를 쓴다', () => {
    const facts = makeFacts({
      harmful_content_hint: '성인물',
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
    });
    const score = calculateScore(facts);

    const explanation = buildFallbackExplanation(facts, score);

    expect(score.verdict).toBe('danger');
    expect(explanation.summary).toBe('위험한 링크로 확인됐어요');
  });

  it('보안 신호(도메인 나이) + 유해 콘텐츠가 함께 있으면 caution 기본 문구를 쓴다', () => {
    const facts = makeFacts({ domain_age_days: 30, harmful_content_hint: '불법 스트리밍' });
    const score = calculateScore(facts);
    expect(score.verdict).toBe('caution');

    const explanation = buildFallbackExplanation(facts, score);

    expect(explanation.summary).toBe('의심스러운 점이 있어요');
  });

  it('유해 콘텐츠 힌트가 없으면 safe 기본 문구를 그대로 쓴다', () => {
    const facts = makeFacts();
    const score = calculateScore(facts);

    const explanation = buildFallbackExplanation(facts, score);

    expect(explanation.summary).toBe('특별한 위험은 찾지 못했어요');
  });
});
