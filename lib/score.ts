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

  const total = Math.min(
    100,
    signals.reduce((sum, signal) => sum + signal.weight, 0)
  );

  const verdict: ScoreResult['verdict'] = total >= 50 ? 'danger' : total >= 20 ? 'caution' : 'safe';

  return { total, verdict, signals };
}
