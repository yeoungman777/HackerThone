# 보안 위험 vs 부적절 콘텐츠 분류 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** URL 검사 결과의 위험 판정을 4단계(danger/caution/content_restricted/safe)로 나눠, 실제 보안 위험(악성코드·피싱)이 있는 사이트만 최상위 경고로 분류하고, 보안 문제는 없지만 도박·성인물·불법 스트리밍처럼 국내 법상 접속 제한 대상인 사이트는 별도 등급으로 분류한다.

**Architecture:** `lib/score.ts`의 `calculateScore`가 우선순위 기반(보안 신호 > 콘텐츠 신호)으로 4단계 verdict를 결정하는 순수 함수로 바뀐다. `content_restricted`일 때만 노출되는 고정 법적 고지 문구는 새 함수 `buildLegalNotice`가 코드에서 직접 생성해(LLM 미개입) `ScanResult.legalNotice`로 API 응답에 실리고, `lib/llm.ts`는 그 문구를 반박하지 않고 부연 설명만 덧붙이도록 프롬프트/폴백이 조정된다. UI는 `VerdictBadge`에 주황색 4번째 상태를 추가하고, 결과 화면에 법적 고지 박스를 렌더링한다.

**Tech Stack:** Next.js 15 (App Router) / TypeScript / Vitest / Zod / Anthropic SDK

## Global Constraints

- 판정(verdict)은 항상 코드가 계산하고 LLM은 이를 반박하거나 바꿀 수 없다 (`CLAUDE.md` 절대 규칙 1) — `content_restricted`에도 동일하게 적용된다.
- 콘텐츠 카테고리 라벨은 정확히 다음으로 표기한다: `도박`→`사설 도박`, `성인 콘텐츠`→`성인물`, `불법 복제물`→`불법 스트리밍`.
- `content_restricted` 고정 고지 문구는 정확히 다음 템플릿이며 `[카테고리]`만 치환한다: `해킹이나 악성코드 위험은 발견되지 않았으나, 국내 법률에 따라 방송통신심의위원회의 차단 대상이 되는 [카테고리] 관련 페이지로 판단됩니다.`
- 판정 우선순위: `danger`(악성 엔진 탐지 OR 비밀번호입력창+브랜드사칭) > `caution`(도메인나이≤30일 OR HTTPS미사용 OR 리다이렉트≥3) > `content_restricted`(유해 콘텐츠 힌트만 있음) > `safe`. 보안 신호가 하나라도 있으면 콘텐츠 신호는 표시용 evidence로만 남고 verdict에는 영향을 주지 않는다.
- 이 앱은 실제로 접속을 차단하지 않는다 — "접근금지"는 UI 라벨일 뿐이며 서버가 대상 URL에 직접 접속하지도 않는다 (`CLAUDE.md` 절대 규칙 3).

---

### Task 1: 타입 확장 — `content_restricted` verdict와 `legalNotice` 필드

**Files:**
- Modify: `lib/types.ts:44-73`

**Interfaces:**
- Produces: `ScoreResult.verdict: 'safe' | 'caution' | 'content_restricted' | 'danger'`, `ScanResult.legalNotice: string | null`

- [ ] **Step 1: `ScoreResult.verdict`에 `content_restricted` 추가**

`lib/types.ts`의 44~52번 줄을 다음으로 교체:

```ts
/** 위험도 산출 결과 (PRD 5.5 확장). lib/score.ts의 순수 함수가 계산한다. */
export interface ScoreResult {
  /** 0~100 사이의 위험 점수. 표시용이 아니라 내부 참고용 — verdict는 우선순위 기반 규칙으로 별도 결정된다. */
  total: number;
  /** danger > caution > content_restricted > safe 우선순위로 결정되는 4단계 판정 */
  verdict: 'safe' | 'caution' | 'content_restricted' | 'danger';
  /** 점수에 실제로 기여한 신호 목록. label은 사용자에게 보여줄 한국어 문장 */
  signals: { label: string; weight: number }[];
}
```

- [ ] **Step 2: `ScanResult`에 `legalNotice` 필드 추가**

`lib/types.ts`의 (Step 1 적용 후 기준) `ScanResult` 인터페이스를 다음으로 교체:

```ts
/** 클라이언트에 최종 반환되는 검사 결과 형태 */
export interface ScanResult {
  facts: ScanFacts;
  score: ScoreResult;
  explanation: LlmExplanation;
  /** verdict가 content_restricted일 때만 값이 있는 고정 법적 고지 문구 (lib/score.ts의 buildLegalNotice가 생성) */
  legalNotice: string | null;
  /** VirusTotal/urlscan 중 한쪽이라도 실패해 일부 데이터만으로 판정했는지 여부 */
  partial: boolean;
}
```

- [ ] **Step 3: 타입 체크로 확인**

Run: `npx tsc --noEmit`
Expected: 여러 개의 에러가 나야 정상 — `lib/score.ts`(아직 `content_restricted` 미처리), `components/VerdictBadge.tsx`(`Record`에 새 키 누락) 등에서 타입 에러가 발생한다. Task 2, 5에서 해결한다. 이 시점에는 **에러가 나는 것이 기대값**이다.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add content_restricted verdict and legalNotice field to types"
```

---

### Task 2: `lib/score.ts` — 우선순위 기반 4단계 판정 + 카테고리 라벨 변경 + 고정 고지 문구

**Files:**
- Modify: `lib/score.ts` (전체 재작성)
- Test: `lib/score.test.ts` (전체 재작성)

**Interfaces:**
- Consumes: `ScoreResult`, `ScanFacts` (Task 1의 `lib/types.ts`)
- Produces: `calculateScore(facts: ScanFacts): ScoreResult` (시그니처 동일), `buildLegalNotice(facts: ScanFacts, verdict: ScoreResult['verdict']): string | null` (신규 export), `detectBrandImpersonationHint(domain: string): string | null`, `detectHarmfulContentHint(categories: string[]): string | null` (시그니처 동일, 라벨만 변경)

- [ ] **Step 1: 실패하는 테스트로 `lib/score.test.ts` 전체 교체**

`lib/score.test.ts` 파일 전체를 다음으로 교체:

```ts
import { describe, expect, it } from 'vitest';
import { buildLegalNotice, calculateScore, detectBrandImpersonationHint, detectHarmfulContentHint } from './score';
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
  it('도박 관련 카테고리를 감지하면 "사설 도박"을 반환한다', () => {
    expect(detectHarmfulContentHint(['gambling'])).toBe('사설 도박');
    expect(detectHarmfulContentHint(['Online Casino'])).toBe('사설 도박');
  });

  it('성인 콘텐츠 카테고리를 감지하면 "성인물"을 반환한다', () => {
    expect(detectHarmfulContentHint(['Pornography'])).toBe('성인물');
  });

  it('불법 복제물 카테고리를 감지하면 "불법 스트리밍"을 반환한다', () => {
    expect(detectHarmfulContentHint(['Piracy/Copyright'])).toBe('불법 스트리밍');
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
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run lib/score.test.ts`
Expected: FAIL — `buildLegalNotice`가 아직 없어서 import 에러, 기존 `calculateScore`는 여전히 옛 3단계 로직이라 다수 assertion 실패.

- [ ] **Step 3: `lib/score.ts` 전체 재작성**

`lib/score.ts` 파일 전체를 다음으로 교체:

```ts
// 위험도 산출 (PRD 5.5 확장: 보안 위험과 콘텐츠 부적절을 분리한 4단계 판정).
// 순수 함수 — LLM 호출 전에 코드가 먼저 판정을 확정한다.
// LLM은 이 결과를 사람 말로 옮길 뿐, verdict를 뒤집을 수 없다 (CLAUDE.md 절대 규칙 1).

import type { ScanFacts, ScoreResult } from './types';

interface BrandHint {
  name: string;
  officialDomains: string[];
}

// 청소년 대상 미끼에서 자주 사칭되는 브랜드 목록 (MVP 범위).
const KNOWN_BRANDS: BrandHint[] = [
  { name: 'instagram', officialDomains: ['instagram.com'] },
  { name: 'discord', officialDomains: ['discord.com', 'discordapp.com'] },
  { name: 'kakao', officialDomains: ['kakao.com', 'kakaocorp.com'] },
  { name: 'naver', officialDomains: ['naver.com'] },
  { name: 'google', officialDomains: ['google.com'] },
  { name: 'facebook', officialDomains: ['facebook.com'] },
];

/** 도메인이 알려진 브랜드명을 포함하면서 그 브랜드의 공식 도메인은 아닌 경우 브랜드명을 반환한다. */
export function detectBrandImpersonationHint(domain: string): string | null {
  const lowerDomain = domain.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    const isOfficial = brand.officialDomains.some(
      (official) => lowerDomain === official || lowerDomain.endsWith(`.${official}`)
    );
    if (isOfficial) continue;
    if (lowerDomain.includes(brand.name)) {
      return brand.name;
    }
  }
  return null;
}

// VirusTotal categories 필드는 벤더마다 영문 표현이 제각각이라(예: "gambling", "Adult Content"),
// 부분 일치 키워드로 느슨하게 매칭한다. 라벨은 방송통신심의위원회 차단 고지 문구와 표현을 맞춘다.
interface HarmfulCategoryRule {
  keywords: string[];
  label: string;
}

const HARMFUL_CATEGORY_RULES: HarmfulCategoryRule[] = [
  { keywords: ['gambling', 'casino', 'betting'], label: '사설 도박' },
  { keywords: ['pornography', 'adult content', 'adult', 'porn'], label: '성인물' },
  { keywords: ['piracy', 'copyright infringement', 'warez', 'illegal software'], label: '불법 스트리밍' },
];

/** VirusTotal 카테고리 목록에서 청소년에게 부적절한 콘텐츠 유형을 찾는다. 일치하는 항목이 없으면 null. */
export function detectHarmfulContentHint(categories: string[]): string | null {
  const lowerCategories = categories.map((category) => category.toLowerCase());
  for (const rule of HARMFUL_CATEGORY_RULES) {
    const matched = lowerCategories.some((category) =>
      rule.keywords.some((keyword) => category.includes(keyword))
    );
    if (matched) return rule.label;
  }
  return null;
}

/**
 * 위험도 산출 (PRD 5.5 확장). 입력 데이터로부터 총점·판정·기여 신호를 계산하는 순수 함수.
 *
 * 판정은 아래 우선순위로 결정한다 — 보안 위험이 항상 콘텐츠 신호보다 우선한다:
 *   1. danger: 악성 엔진 탐지 또는 (비밀번호 입력칸 + 브랜드 사칭) 중 하나라도 있으면
 *   2. caution: 위 신호는 없지만 도메인 나이·HTTPS·리다이렉트 중 하나라도 걸리면
 *   3. content_restricted: 위 둘 다 없고 유해 콘텐츠 힌트가 있으면
 *   4. safe: 아무 신호도 없으면
 */
export function calculateScore(facts: ScanFacts): ScoreResult {
  const signals: ScoreResult['signals'] = [];

  const maliciousEngines = facts.virustotal?.engines_malicious ?? 0;
  const hasPasswordPhishingPattern = Boolean(
    facts.urlscan?.has_password_input && facts.brand_impersonation_hint
  );

  if (maliciousEngines >= 1) {
    signals.push({ label: '보안 검사에서 위험하다고 판단했어요', weight: 40 });
  }
  // 이미 danger로 확정되는 신호(악성 엔진 1개 이상)에 대한 부가 근거일 뿐, 점수에는 반영하지 않는다.
  if (maliciousEngines >= 3) {
    signals.push({ label: '여러 보안 검사가 동시에 위험하다고 판단했어요', weight: 0 });
  }
  if (hasPasswordPhishingPattern) {
    signals.push({ label: '유명 서비스인 척하면서 비밀번호를 입력받으려 해요', weight: 25 });
  }

  const isDanger = maliciousEngines >= 1 || hasPasswordPhishingPattern;

  const domainIsNew = facts.domain_age_days !== null && facts.domain_age_days <= 30;
  if (domainIsNew) {
    signals.push({ label: '만들어진 지 얼마 안 된 사이트예요', weight: 20 });
  }

  if (!facts.uses_https) {
    signals.push({ label: '연결이 암호화되어 있지 않아요', weight: 10 });
  }

  const redirectCount = facts.urlscan?.redirect_count ?? 0;
  const tooManyRedirects = redirectCount >= 3;
  if (tooManyRedirects) {
    signals.push({ label: '다른 주소로 여러 번 이동했어요', weight: 10 });
  }

  const isCaution = !isDanger && (domainIsNew || !facts.uses_https || tooManyRedirects);

  if (facts.harmful_content_hint) {
    signals.push({
      label: `청소년에게 맞지 않는 내용(${facts.harmful_content_hint})이 있을 수 있어요`,
      weight: 20,
    });
  }

  const isContentRestricted = !isDanger && !isCaution && Boolean(facts.harmful_content_hint);

  const total = Math.min(
    100,
    signals.reduce((sum, signal) => sum + signal.weight, 0)
  );

  const verdict: ScoreResult['verdict'] = isDanger
    ? 'danger'
    : isCaution
      ? 'caution'
      : isContentRestricted
        ? 'content_restricted'
        : 'safe';

  return { total, verdict, signals };
}

/**
 * verdict가 content_restricted일 때만 노출하는 고정 법적 고지 문구를 만든다.
 * 표현이 매번 달라지면 안 되는 문장이라 LLM을 거치지 않고 코드에서 그대로 생성한다.
 */
export function buildLegalNotice(facts: ScanFacts, verdict: ScoreResult['verdict']): string | null {
  if (verdict !== 'content_restricted' || !facts.harmful_content_hint) return null;
  return `해킹이나 악성코드 위험은 발견되지 않았으나, 국내 법률에 따라 방송통신심의위원회의 차단 대상이 되는 ${facts.harmful_content_hint} 관련 페이지로 판단됩니다.`;
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npx vitest run lib/score.test.ts`
Expected: PASS (모든 테스트)

- [ ] **Step 5: Commit**

```bash
git add lib/score.ts lib/score.test.ts
git commit -m "feat: split danger/caution security tiers from content_restricted verdict"
```

---

### Task 3: `lib/llm.ts` — `content_restricted` 프롬프트 규칙 + 폴백 분기

**Files:**
- Modify: `lib/llm.ts:12-49` (SYSTEM_PROMPT), `lib/llm.ts:96-157` (FALLBACK_TEXT/buildFallbackExplanation)
- Test: `lib/llm.test.ts` (전체 재작성)

**Interfaces:**
- Consumes: `calculateScore` (Task 2), `ScoreResult`/`ScanFacts`/`LlmExplanation` (Task 1)
- Produces: `buildFallbackExplanation(facts: ScanFacts, score: ScoreResult): LlmExplanation` (시그니처 동일), `generateExplanation(facts, score): Promise<LlmExplanation>` (시그니처 동일)

- [ ] **Step 1: 실패하는 테스트로 `lib/llm.test.ts` 전체 교체**

`lib/llm.test.ts` 파일 전체를 다음으로 교체:

```ts
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
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run lib/llm.test.ts`
Expected: FAIL — `buildFallbackExplanation`이 아직 `content_restricted` verdict를 모르는 상태라 `FALLBACK_TEXT[score.verdict]`가 `undefined`가 되어 첫 번째 테스트에서 타입/런타임 에러가 난다.

- [ ] **Step 3: `SYSTEM_PROMPT`의 콘텐츠 관련 규칙 교체**

`lib/llm.ts:20-22`(기존 harmful_content_hint 전용 규칙)을 다음으로 교체:

```ts
- verdict가 "content_restricted"인 경우, 이미 "국내 법률에 따라 방송통신심의위원회의 차단 대상"이라는 법적
  판단이 별도 문구로 사용자에게 먼저 표시된다. 너는 그 판단을 반박하거나 다른 표현으로 재진술하지 않는다.
  story에는 그 판단에 대한 짧은 부연 설명만 담는다 — 예를 들어 보안 위험 신호 없이도 이런 사이트가 왜
  문제가 되는지, 왜 청소년에게 맞지 않는지. "계정이 털린다", "정보가 유출된다" 같은 피싱 서사는 쓰지 않는다.
```

`lib/llm.ts:48`(`- verdict가 "safe"인 경우: ...` 줄) 바로 다음 줄에 아래 항목을 추가:

```ts
- verdict가 "content_restricted"인 경우: summary와 story 모두 이미 표시된 법적 고지 문구와 모순되지
  않아야 한다. "위험한 사이트"라는 표현 대신 "접속이 제한되는 사이트" 톤을 쓴다.
```

- [ ] **Step 4: `buildFallbackExplanation`을 verdict 기반 분기로 재작성**

`lib/llm.ts:120-157`(기존 `HARMFUL_CONTENT_FALLBACK_TIPS` 상수부터 `buildFallbackExplanation` 함수 끝까지)을 다음으로 교체:

```ts
const CONTENT_RESTRICTED_FALLBACK_TIPS = [
  '이런 사이트는 친구가 보내줘도 들어가지 않는 게 안전해요.',
  '검사가 완벽하지는 않으니 조금이라도 이상하면 누르지 마세요.',
];

/**
 * LLM 호출이 실패했을 때 사용하는 템플릿 폴백 (PRD 부록 C.5, 7.4).
 * score.ts가 계산한 신호를 그대로 근거로 보여준다.
 *
 * verdict가 content_restricted면 계정 탈취(피싱)와는 다른, 콘텐츠 자체가 국내 법상 접속 제한
 * 대상이라는 별도 문구를 쓴다 — score.ts가 이미 보안 신호 유무를 판정에 반영했으므로 여기서는
 * verdict만 보고 분기하면 된다.
 */
export function buildFallbackExplanation(facts: ScanFacts, score: ScoreResult): LlmExplanation {
  const evidence = score.signals.map((signal) => ({ icon: '•', text: signal.label }));

  if (score.verdict === 'content_restricted') {
    const label = facts.harmful_content_hint ?? '부적절한 콘텐츠';
    return {
      summary: `${label} 관련 사이트예요`,
      story: `이 사이트는 ${label} 관련 내용을 담고 있어요. 계정이 털리는 것과는 다르지만, 국내 법률상 접속이 제한되는 유형의 사이트라 들어가지 않는 걸 권해요.`,
      evidence,
      tips: CONTENT_RESTRICTED_FALLBACK_TIPS,
    };
  }

  const fallback = FALLBACK_TEXT[score.verdict];
  return {
    summary: fallback.summary,
    story: fallback.story,
    evidence,
    tips: fallback.tips,
  };
}
```

`lib/llm.ts:96`의 `FALLBACK_TEXT` 타입 선언 줄을 다음으로 교체 (키에서 `content_restricted`를 제외해, 위 Step에서 먼저 분기 처리했음을 타입으로도 강제):

```ts
const FALLBACK_TEXT: Record<Exclude<ScoreResult['verdict'], 'content_restricted'>, { summary: string; story: string; tips: string[] }> = {
```

(`danger`/`caution`/`safe` 세 항목의 내용은 변경하지 않는다.)

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `npx vitest run lib/llm.test.ts`
Expected: PASS (모든 테스트)

- [ ] **Step 6: 전체 테스트 스위트 확인**

Run: `npx vitest run`
Expected: PASS (전체 — `lib/rateLimit.test.ts` 포함, 이번 작업과 무관한 기존 테스트도 계속 통과해야 함)

- [ ] **Step 7: Commit**

```bash
git add lib/llm.ts lib/llm.test.ts
git commit -m "feat: add content_restricted prompt rules and fallback branch to llm.ts"
```

---

### Task 4: API 라우트 — `legalNotice`를 응답에 포함

**Files:**
- Modify: `app/api/scan/route.ts:3-8` (import), `app/api/scan/route.ts:92-98` (응답 조립)

**Interfaces:**
- Consumes: `buildLegalNotice` (Task 2), `ScanResult.legalNotice` (Task 1)
- Produces: `POST /api/scan` 응답 JSON에 `legalNotice: string | null` 필드 포함

- [ ] **Step 1: import에 `buildLegalNotice` 추가**

`app/api/scan/route.ts:5`를 다음으로 교체:

```ts
import { buildLegalNotice, calculateScore, detectBrandImpersonationHint, detectHarmfulContentHint } from '@/lib/score';
```

- [ ] **Step 2: 응답 조립부에 `legalNotice` 계산 추가**

`app/api/scan/route.ts:92-96`을 다음으로 교체:

```ts
  // 판정은 코드가 계산한다 — LLM에게 "위험한가?"를 묻지 않는다 (CLAUDE.md 절대 규칙 1).
  const score = calculateScore(facts);
  const legalNotice = buildLegalNotice(facts, score.verdict);
  const explanation = await generateExplanation(facts, score);

  const result: ScanResult = { facts, score, explanation, legalNotice, partial };
```

- [ ] **Step 3: 타입 체크로 확인**

Run: `npx tsc --noEmit`
Expected: `app/api/scan/route.ts` 관련 에러 없음 (Task 5를 아직 안 했다면 `components/VerdictBadge.tsx` 에러는 남아있는 게 정상)

- [ ] **Step 4: Commit**

```bash
git add app/api/scan/route.ts
git commit -m "feat: include legalNotice in scan API response"
```

---

### Task 5: `VerdictBadge` — `content_restricted` 주황색 배지 추가

**Files:**
- Modify: `components/VerdictBadge.tsx:1-24`

**Interfaces:**
- Consumes: `ScoreResult['verdict']` (Task 1, 이제 `content_restricted` 포함)

- [ ] **Step 1: `VERDICT_STYLE`에 `content_restricted` 항목 추가**

`components/VerdictBadge.tsx:3-24`를 다음으로 교체:

```ts
const VERDICT_STYLE: Record<
  ScoreResult["verdict"],
  { emoji: string; label: string; className: string }
> = {
  danger: {
    emoji: "🔴",
    label: "위험해요",
    className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  caution: {
    emoji: "🟡",
    label: "주의가 필요해요",
    className:
      "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  },
  content_restricted: {
    emoji: "🟠",
    label: "접속은 되지만 제한 대상이에요",
    className:
      "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  },
  safe: {
    emoji: "🟢",
    label: "안전해 보여요",
    className:
      "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
};
```

- [ ] **Step 2: 타입 체크로 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (Task 1~5를 모두 마쳤으므로 이 시점부터 프로젝트 전체가 타입 에러 없이 컴파일돼야 한다)

- [ ] **Step 3: Commit**

```bash
git add components/VerdictBadge.tsx
git commit -m "feat: add orange content_restricted badge style"
```

---

### Task 6: 결과 화면 — 법적 고지 박스 렌더링 + 최종 검증

**Files:**
- Modify: `app/result/page.tsx:157-163`

**Interfaces:**
- Consumes: `ScanResult.legalNotice` (Task 1, 4)

- [ ] **Step 1: `legalNotice` 구조분해 + 렌더링 추가**

`app/result/page.tsx:157-163`을 다음으로 교체:

```tsx
  const { score, explanation, facts, legalNotice, partial } = result;

  return (
    <div className="flex flex-col gap-8 py-6">
      <VerdictBadge verdict={score.verdict} />

      {legalNotice && (
        <p className="rounded-xl bg-orange-50 px-4 py-3 text-center text-sm leading-relaxed text-orange-800 dark:bg-orange-950 dark:text-orange-200">
          {legalNotice}
        </p>
      )}

      <p className="text-center text-lg font-bold">{explanation.summary}</p>
```

- [ ] **Step 2: 빌드로 전체 확인**

Run: `npm run build`
Expected: 빌드 성공 (타입 에러/린트 에러 없음)

- [ ] **Step 3: 전체 테스트 스위트 재확인**

Run: `npx vitest run`
Expected: PASS (전체)

- [ ] **Step 4: 개발 서버에서 `content_restricted` 배지·박스 육안 확인**

`npm run dev`로 서버를 띄운 뒤, 실제 도박/성인물 사이트에 접속하지 않고 확인한다 — 대신
`lib/score.test.ts`의 `content_restricted` 케이스처럼 `harmful_content_hint`가 채워진 `ScanFacts`를
브라우저 devtools에서 `sessionStorage`나 직접 fetch 호출로 재현하기보다는, 아래처럼 임시로
`app/result/page.tsx` 최상단에서 `result`를 하드코딩한 목업으로 잠깐 바꿔 렌더링을 확인한 뒤
되돌리는 방식을 권장한다 (실서비스 코드에 남기지 않는다):

1. `app/result/page.tsx`의 `if (!result) return null;` 바로 다음 줄에 임시로
   `result.score.verdict = 'content_restricted'; result.legalNotice = '해킹이나 악성코드 위험은 발견되지 않았으나, 국내 법률에 따라 방송통신심의위원회의 차단 대상이 되는 사설 도박 관련 페이지로 판단됩니다.';`
   를 넣고 아무 URL이나 검사해서 주황 배지와 고지 박스가 올바르게 보이는지 스크린샷으로 확인한다.
2. 확인 후 반드시 이 임시 코드를 제거한다 (`git diff`로 `app/result/page.tsx`가 Step 1 상태와
   동일한지 확인).

- [ ] **Step 5: Commit**

```bash
git add app/result/page.tsx
git commit -m "feat: render legal notice box for content_restricted verdict"
```
