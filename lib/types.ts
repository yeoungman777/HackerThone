// 이 프로젝트의 핵심 타입 정의 (PRD 5.4, 5.5, 부록 C.4 기준)

/** VirusTotal 조회 결과 (PRD 5.4). 조회 자체가 실패하면 undefined. */
export interface VirusTotalFacts {
  engines_total: number;
  engines_malicious: number;
  engines_suspicious: number;
  categories: string[];
}

/** urlscan.io 스캔 결과 (PRD 5.4 + STEP 4 확장 필드). 조회 자체가 실패하면 undefined. */
export interface UrlscanFacts {
  final_url: string;
  redirect_count: number;
  redirect_chain: string[]; // 도메인만 담는다 (전체 URL 아님)
  has_password_input: boolean;
  external_domains_contacted: number;
  screenshot_url: string | null;
  page_title: string | null;
  domain_age_days: number | null;
  server_country: string | null;
}

/**
 * 외부 API에서 수집한 사실 데이터 (PRD 5.4 스키마).
 * LLM에는 이 구조화된 데이터만 전달하고 원본 HTML/텍스트는 절대 포함하지 않는다.
 */
export interface ScanFacts {
  url_normalized: string;
  domain: string;
  domain_age_days: number | null;
  tld: string;
  uses_https: boolean;
  /** VirusTotal 호출이 실패했을 수 있으므로 optional/null 허용 */
  virustotal?: VirusTotalFacts | null;
  /** urlscan.io 호출이 실패했을 수 있으므로 optional/null 허용 */
  urlscan?: UrlscanFacts | null;
  /** urlscan.io가 실패했을 때(유튜브·구글 등 정책적 차단 포함)만 microlink.io로 대체 시도한 스크린샷 URL */
  fallback_screenshot_url?: string | null;
  /** 도메인이 유명 브랜드와 유사한 경우의 브랜드명 힌트 (예: "instagram") */
  brand_impersonation_hint?: string | null;
  /** VirusTotal 카테고리에서 청소년에게 부적절한 콘텐츠 유형을 찾은 경우의 힌트 (예: "도박"). 계정 탈취 위험과는 별개의 신호다. */
  harmful_content_hint?: string | null;
  /** urlscan.io가 이 URL에 아예 접속하지 못한 경우(DNS 조회 실패 등) true. 이미 차단됐거나 사라진 페이지일 가능성이 높다 (PRD 7.4). */
  target_unreachable?: boolean;
}

/** 위험도 산출 결과 (PRD 5.5 확장). lib/score.ts의 순수 함수가 계산한다. */
export interface ScoreResult {
  /** 0~100 사이의 위험 점수. 표시용이 아니라 내부 참고용 — verdict는 우선순위 기반 규칙으로 별도 결정된다. */
  total: number;
  /** danger > caution > content_restricted > safe 우선순위로 결정되는 4단계 판정 */
  verdict: 'safe' | 'caution' | 'content_restricted' | 'danger';
  /** 점수에 실제로 기여한 신호 목록. label은 사용자에게 보여줄 한국어 문장 */
  signals: { label: string; weight: number }[];
}

/** LLM이 생성하는 서사형 설명 (PRD 부록 C.4 zod 스키마와 대응) */
export interface LlmExplanation {
  /** 한 줄 요약 (40자 이내) */
  summary: string;
  /** 눌렀다면 벌어졌을 일. 2~4문장, 시간 순서 서술 */
  story: string;
  /** 판단 근거. icon + 한 줄 설명, 3~5개 */
  evidence: { icon: string; text: string }[];
  /** 다음에 스스로 알아보는 방법 팁, 2~3개 */
  tips: string[];
}

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

/** 대처 체크리스트 화면에서 사용자가 선택하는 플랫폼 (PRD 부록 D) */
export type RecoveryPlatform = 'instagram' | 'discord' | 'kakao' | 'message' | 'found_online' | 'other';

/** 대처 체크리스트 화면에서 사용자가 선택하는 행동 (복수 선택 가능, PRD 부록 D) */
export type RecoveryAction = 'clicked' | 'credentials' | 'app' | 'photo' | 'money';
