// URL 정규화·검증 (PRD 1단계). 여기서는 형식만 검사하고,
// 대상 URL에 실제로 접속하지 않는다 (CLAUDE.md 절대 규칙 3).

export type NormalizeReason =
  | 'empty'
  | 'invalid_format'
  | 'unsupported_scheme'
  | 'private_host';

export type NormalizeResult =
  | { ok: true; url: string }
  | { ok: false; reason: NormalizeReason };

/** 정규화 실패 사유를 청소년이 이해할 수 있는 한국어 문구로 옮긴다. 입력/결과 화면에서 공용으로 쓴다. */
export const NORMALIZE_ERROR_MESSAGES: Record<NormalizeReason, string> = {
  empty: '링크를 입력해주세요',
  invalid_format: '링크 형식을 확인해주세요',
  unsupported_scheme: '지원하지 않는 형태의 링크예요',
  private_host: '이 주소는 검사할 수 없어요',
};

const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^\[?::1\]?$/,
];

export function normalizeUrl(input: string): NormalizeResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty' };
  }

  const withScheme = SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    // URL 생성자가 유니코드 도메인을 IDNA(퓨니코드)로 자동 변환한다.
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, reason: 'invalid_format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported_scheme' };
  }

  if (PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(parsed.hostname))) {
    return { ok: false, reason: 'private_host' };
  }

  return { ok: true, url: parsed.toString() };
}
