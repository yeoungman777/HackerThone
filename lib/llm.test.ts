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
  it('유해 콘텐츠 힌트만 있고 계정 탈취 신호가 없으면 콘텐츠 전용 문구를 반환한다', () => {
    const facts = makeFacts({ harmful_content_hint: '도박' });
    const score = calculateScore(facts);

    const explanation = buildFallbackExplanation(facts, score);

    expect(explanation.summary).toContain('도박');
    expect(explanation.story).toContain('도박');
    // 계정 탈취(피싱)로 오해하지 않도록 명시적으로 구분하는 문구인지 확인한다.
    expect(explanation.story).toContain('계정이 털리는 것과는 다르지만');
    expect(explanation.summary).not.toBe('위험한 링크로 확인됐어요');
    expect(explanation.summary).not.toBe('의심스러운 점이 있어요');
    expect(explanation.evidence).toHaveLength(score.signals.length);
  });

  it('유해 콘텐츠 힌트 + 악성 엔진 탐지가 함께 있으면 기존 verdict 기본 문구를 쓴다', () => {
    const facts = makeFacts({
      harmful_content_hint: '도박',
      virustotal: { engines_total: 70, engines_malicious: 1, engines_suspicious: 0, categories: [] },
    });
    const score = calculateScore(facts);

    const explanation = buildFallbackExplanation(facts, score);

    expect(explanation.summary).toBe('위험한 링크로 확인됐어요');
    expect(explanation.evidence.some((item) => item.text.includes('도박'))).toBe(true);
  });

  it('유해 콘텐츠 힌트 + 비밀번호 입력칸/브랜드 사칭이 함께 있으면 기존 verdict 기본 문구를 쓴다', () => {
    const facts = makeFacts({
      harmful_content_hint: '성인 콘텐츠',
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

    expect(score.verdict).toBe('caution');
    expect(explanation.summary).toBe('의심스러운 점이 있어요');
  });

  it('유해 콘텐츠 힌트가 없으면 기존 verdict 기본 문구를 그대로 쓴다', () => {
    const facts = makeFacts();
    const score = calculateScore(facts);

    const explanation = buildFallbackExplanation(facts, score);

    expect(explanation.summary).toBe('특별한 위험은 찾지 못했어요');
  });

  it('접속 불가(target_unreachable)면 다른 신호가 없어도 사라진 사이트 문구를 쓴다', () => {
    const facts = makeFacts({ target_unreachable: true, urlscan: null });
    const score = calculateScore(facts);

    const explanation = buildFallbackExplanation(facts, score);

    expect(explanation.summary).toBe('이미 사라졌거나 차단된 페이지예요');
    expect(explanation.story).not.toContain('예전 기록');
    expect(explanation.evidence[0]).toEqual({ icon: '🚫', text: '지금은 이 주소로 연결되지 않아요' });
  });

  it('접속 불가 + 다른 위험 신호가 있으면 그 사실도 함께 경고한다', () => {
    const facts = makeFacts({
      target_unreachable: true,
      urlscan: null,
      virustotal: { engines_total: 70, engines_malicious: 3, engines_suspicious: 0, categories: [] },
    });
    const score = calculateScore(facts);

    const explanation = buildFallbackExplanation(facts, score);

    expect(explanation.summary).toBe('이미 사라졌거나 차단된 페이지예요');
    expect(explanation.story).toContain('예전 기록');
    expect(explanation.evidence.length).toBeGreaterThan(1);
  });

  it('접속 불가는 유해 콘텐츠 힌트보다 우선한다', () => {
    const facts = makeFacts({ target_unreachable: true, urlscan: null, harmful_content_hint: '도박' });
    const score = calculateScore(facts);

    const explanation = buildFallbackExplanation(facts, score);

    expect(explanation.summary).toBe('이미 사라졌거나 차단된 페이지예요');
  });
});
