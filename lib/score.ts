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

// 불법 웹툰·만화 공유 사이트는 차단을 피하려고 도메인(특히 TLD)을 계속 바꾸기 때문에
// VirusTotal 같은 평판 데이터베이스가 새 도메인을 따라잡지 못하는 경우가 많다(신규 도메인은
// 카테고리 데이터 자체가 없어 "안전"으로 잘못 판정됨). 그래도 사이트 이름 자체는 도메인이
// 바뀌어도 그대로 쓰는 경우가 많아, 이름 키워드로 보조 탐지한다.
const KNOWN_PIRACY_SITE_KEYWORDS = ['newtoki', 'manatoki', 'toonkor', 'marumaru', 'hitoon'];

/** 도메인에 알려진 불법 웹툰·만화 공유 사이트 이름이 포함되어 있으면 그 이름을 반환한다. */
export function detectKnownPiracySiteHint(domain: string): string | null {
  const lowerDomain = domain.toLowerCase();
  return KNOWN_PIRACY_SITE_KEYWORDS.find((keyword) => lowerDomain.includes(keyword)) ?? null;
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

// VirusTotal의 카테고리 벤더(Dr.Web, BitDefender 등)는 종종 서로 다른 판단을 내린다. 실제로
// 평범한 유튜브 영상을 Dr.Web 한 곳만 "violence/adult content"로 잘못 분류하고 나머지 5개
// 벤더는 무관한 카테고리("videos", "video hosting" 등)를 반환한 사례가 있었다. 벤더 1곳의
// 오분류로 판정이 흔들리지 않도록, 같은 유해 카테고리로 분류한 벤더가 2곳 이상일 때만 인정한다.
const MIN_AGREEING_VENDORS = 2;

/** VirusTotal 카테고리 목록에서 청소년에게 부적절한 콘텐츠 유형을 찾는다. 일치하는 항목이 없으면 null. */
export function detectHarmfulContentHint(categories: string[]): string | null {
  const lowerCategories = categories.map((category) => category.toLowerCase());
  for (const rule of HARMFUL_CATEGORY_RULES) {
    const matchCount = lowerCategories.filter((category) =>
      rule.keywords.some((keyword) => category.includes(keyword))
    ).length;
    if (matchCount >= MIN_AGREEING_VENDORS) return rule.label;
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
