// 위험도 산출 (PRD 5.5). 순수 함수 — LLM 호출 전에 코드가 먼저 판정을 확정한다.
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
// 부분 일치 키워드로 느슨하게 매칭한다. 계정 탈취·악성코드 위험과는 성격이 다른 신호이므로
// score.ts에서 별도 가중치로, llm.ts 프롬프트에서 별도 서사로 다룬다.
interface HarmfulCategoryRule {
  keywords: string[];
  /** 이 중 하나라도 포함되면 매칭에서 제외한다 (아래 exclude 주석 참고). */
  exclude?: string[];
  label: string;
}

const HARMFUL_CATEGORY_RULES: HarmfulCategoryRule[] = [
  { keywords: ['gambling', 'casino', 'betting'], label: '도박' },
  {
    keywords: ['pornography', 'adult content', 'adult', 'porn'],
    // alphaMountain.ai 등 일부 벤더는 "violence/adult content"처럼 폭력·선정성을
    // 묶어 "콘텐츠 주의가 필요할 수 있다"는 일반 경고 태그를 붙인다. 이건 "이
    // 사이트가 성인물이다"라는 뜻이 아니라, 유튜브처럼 사용자 업로드 영상이
    // 많은 대형 플랫폼에도 흔히 붙는 태그다. 실측 결과 youtube.com이 바로 이
    // 태그 때문에 "성인 콘텐츠"로 오탐됐다 — violence와 묶인 태그는 제외한다.
    exclude: ['violence'],
    label: '성인 콘텐츠',
  },
  { keywords: ['piracy', 'copyright infringement', 'warez', 'illegal software'], label: '불법 복제물' },
];

/** VirusTotal 카테고리 목록에서 청소년에게 부적절한 콘텐츠 유형을 찾는다. 일치하는 항목이 없으면 null. */
export function detectHarmfulContentHint(categories: string[]): string | null {
  const lowerCategories = categories.map((category) => category.toLowerCase());
  for (const rule of HARMFUL_CATEGORY_RULES) {
    const matched = lowerCategories.some((category) => {
      if (rule.exclude?.some((excluded) => category.includes(excluded))) return false;
      return rule.keywords.some((keyword) => category.includes(keyword));
    });
    if (matched) return rule.label;
  }
  return null;
}

/** PRD 5.5 위험도 산출 규칙. 입력 데이터로부터 총점·판정·기여 신호를 계산하는 순수 함수. */
export function calculateScore(facts: ScanFacts): ScoreResult {
  const signals: ScoreResult['signals'] = [];

  const maliciousEngines = facts.virustotal?.engines_malicious ?? 0;
  if (maliciousEngines >= 1) {
    signals.push({ label: '보안 검사에서 위험하다고 판단했어요', weight: 40 });
  }
  if (maliciousEngines >= 3) {
    signals.push({ label: '여러 보안 검사가 동시에 위험하다고 판단했어요', weight: 30 });
  }

  if (facts.domain_age_days !== null && facts.domain_age_days <= 30) {
    signals.push({ label: '만들어진 지 얼마 안 된 사이트예요', weight: 20 });
  }

  const hasPasswordInput = facts.urlscan?.has_password_input ?? false;
  if (hasPasswordInput && facts.brand_impersonation_hint) {
    signals.push({ label: '유명 서비스인 척하면서 비밀번호를 입력받으려 해요', weight: 25 });
  }

  if (!facts.uses_https) {
    signals.push({ label: '연결이 암호화되어 있지 않아요', weight: 10 });
  }

  const redirectCount = facts.urlscan?.redirect_count ?? 0;
  if (redirectCount >= 3) {
    signals.push({ label: '다른 주소로 여러 번 이동했어요', weight: 10 });
  }

  if (facts.harmful_content_hint) {
    signals.push({
      label: `청소년에게 맞지 않는 내용(${facts.harmful_content_hint})이 있을 수 있어요`,
      weight: 20,
    });
  }

  const total = Math.min(
    100,
    signals.reduce((sum, signal) => sum + signal.weight, 0)
  );

  const verdict: ScoreResult['verdict'] = total >= 50 ? 'danger' : total >= 20 ? 'caution' : 'safe';

  return { total, verdict, signals };
}
