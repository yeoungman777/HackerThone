import { describe, expect, it } from 'vitest';
import {
  buildLegalNotice,
  calculateScore,
  detectBrandImpersonationHint,
  detectHarmfulContentHint,
  detectKnownPiracySiteHint,
} from './score';
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

describe('calculateScore', () => {
  it('신호가 하나도 없으면 안전으로 판정한다', () => {
    const result = calculateScore(makeFacts());
    expect(result.total).toBe(0);
    expect(result.verdict).toBe('safe');
    expect(result.signals).toHaveLength(0);
  });

  it('악성 엔진 1개 이상이면 다른 신호와 무관하게 danger로 판정한다', () => {
    const result = calculateScore(
      makeFacts({ virustotal: { engines_total: 70, engines_malicious: 1, engines_suspicious: 0, categories: [] } })
    );
    expect(result.verdict).toBe('danger');
  });

  it('악성 엔진 3개 이상이면 danger이고, 근거 목록에 추가 문구가 포함된다', () => {
    const result = calculateScore(
      makeFacts({ virustotal: { engines_total: 70, engines_malicious: 3, engines_suspicious: 0, categories: [] } })
    );
    expect(result.verdict).toBe('danger');
    expect(result.signals.some((s) => s.label === '여러 보안 검사가 동시에 위험하다고 판단했어요')).toBe(true);
  });

  it('비밀번호 입력칸 + 브랜드 사칭이면 VirusTotal 탐지가 없어도 danger로 판정한다', () => {
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
    expect(result.verdict).toBe('danger');
  });

  it('비밀번호 입력칸만 있고 브랜드 힌트가 없으면 danger로 올리지 않는다', () => {
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
    expect(result.verdict).toBe('safe');
  });

  it('악성 엔진 탐지와 유해 콘텐츠가 동시에 있으면 콘텐츠 신호를 무시하고 danger가 우선한다', () => {
    const result = calculateScore(
      makeFacts({
        harmful_content_hint: '성인물',
        virustotal: { engines_total: 70, engines_malicious: 1, engines_suspicious: 0, categories: [] },
      })
    );
    expect(result.verdict).toBe('danger');
  });

  it('도메인 생성 30일 이내면 caution으로 판정한다 (유해 콘텐츠 없음)', () => {
    const result = calculateScore(makeFacts({ domain_age_days: 30 }));
    expect(result.verdict).toBe('caution');
  });

  it('도메인 생성 31일이면 신호가 발생하지 않는다', () => {
    const result = calculateScore(makeFacts({ domain_age_days: 31 }));
    expect(result.verdict).toBe('safe');
  });

  it('HTTPS를 사용하지 않으면 caution으로 판정한다', () => {
    const result = calculateScore(makeFacts({ uses_https: false }));
    expect(result.verdict).toBe('caution');
  });

  it('리다이렉트 3회 이상이면 caution으로 판정한다', () => {
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
    expect(result.verdict).toBe('caution');
  });

  it('보안 신호(도메인 나이)와 유해 콘텐츠가 동시에 있으면 caution이 content_restricted보다 우선한다', () => {
    const result = calculateScore(makeFacts({ domain_age_days: 30, harmful_content_hint: '사설 도박' }));
    expect(result.verdict).toBe('caution');
  });

  it('보안 신호 없이 유해 콘텐츠 힌트만 있으면 content_restricted로 판정한다', () => {
    const result = calculateScore(makeFacts({ harmful_content_hint: '사설 도박' }));
    expect(result.verdict).toBe('content_restricted');
    expect(result.signals[0].label).toContain('사설 도박');
  });

  it('유해 콘텐츠 힌트가 없으면(null) content_restricted가 되지 않는다', () => {
    const result = calculateScore(makeFacts({ harmful_content_hint: null }));
    expect(result.verdict).toBe('safe');
  });

  it('데이터가 없거나(null/undefined) 조회 실패한 필드는 신호를 만들지 않는다', () => {
    const result = calculateScore(makeFacts({ virustotal: null, urlscan: null, domain_age_days: null }));
    expect(result.total).toBe(0);
    expect(result.verdict).toBe('safe');
  });
});

describe('buildLegalNotice', () => {
  it('content_restricted 판정이면 카테고리를 포함한 고정 문구를 반환한다', () => {
    const facts = makeFacts({ harmful_content_hint: '사설 도박' });
    const notice = buildLegalNotice(facts, 'content_restricted');
    expect(notice).toBe(
      '해킹이나 악성코드 위험은 발견되지 않았으나, 국내 법률에 따라 방송통신심의위원회의 차단 대상이 되는 사설 도박 관련 페이지로 판단됩니다.'
    );
  });

  it('content_restricted가 아니면 null을 반환한다', () => {
    const facts = makeFacts({ harmful_content_hint: '사설 도박' });
    expect(buildLegalNotice(facts, 'danger')).toBeNull();
    expect(buildLegalNotice(facts, 'caution')).toBeNull();
    expect(buildLegalNotice(facts, 'safe')).toBeNull();
  });

  it('harmful_content_hint가 없으면 content_restricted여도 null을 반환한다', () => {
    const facts = makeFacts({ harmful_content_hint: null });
    expect(buildLegalNotice(facts, 'content_restricted')).toBeNull();
  });
});

describe('detectHarmfulContentHint', () => {
  it('도박 관련 카테고리를 서로 다른 벤더 2곳 이상이 보고하면 "사설 도박"을 반환한다', () => {
    expect(detectHarmfulContentHint(['gambling', 'Online Casino'])).toBe('사설 도박');
  });

  it('성인 콘텐츠 카테고리를 서로 다른 벤더 2곳 이상이 보고하면 "성인물"을 반환한다', () => {
    expect(detectHarmfulContentHint(['Pornography', 'adult content'])).toBe('성인물');
  });

  it('불법 복제물 카테고리를 서로 다른 벤더 2곳 이상이 보고하면 "불법 스트리밍"을 반환한다', () => {
    expect(detectHarmfulContentHint(['Piracy/Copyright', 'warez'])).toBe('불법 스트리밍');
  });

  it('벤더 한 곳만 유해 카테고리로 분류하고 나머지는 무관한 카테고리면 오탐으로 보고 null을 반환한다', () => {
    // 실제 사례: youtube.com 노래 영상을 Dr.Web 한 곳만 "violence/adult content"로 분류하고
    // 나머지 5개 벤더는 "videos", "video hosting", "social web - youtube" 등 무관한 카테고리를 반환했다.
    expect(
      detectHarmfulContentHint([
        'Image and Video Search, Video/Multimedia (alphaMountain.ai)',
        'videos',
        'violence/adult content',
        'video hosting',
        'social web - youtube',
        'parked sites',
      ])
    ).toBeNull();
  });

  it('일치하는 카테고리가 없으면 null을 반환한다', () => {
    expect(detectHarmfulContentHint(['phishing', 'malware'])).toBeNull();
  });

  it('카테고리가 비어 있으면 null을 반환한다', () => {
    expect(detectHarmfulContentHint([])).toBeNull();
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

describe('detectKnownPiracySiteHint', () => {
  it('알려진 불법 웹툰 사이트 이름이 도메인에 포함되어 있으면 그 이름을 반환한다', () => {
    expect(detectKnownPiracySiteHint('newtoki1.org')).toBe('newtoki');
    expect(detectKnownPiracySiteHint('www.manatoki123.net')).toBe('manatoki');
  });

  it('대소문자와 무관하게 감지한다', () => {
    expect(detectKnownPiracySiteHint('NewToki1.ORG')).toBe('newtoki');
  });

  it('알려진 이름을 포함하지 않으면 null을 반환한다', () => {
    expect(detectKnownPiracySiteHint('example.com')).toBeNull();
  });
});
