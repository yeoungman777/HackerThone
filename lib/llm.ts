// LLM 서사 설명 생성 (PRD 부록 C). 판정은 이미 lib/score.ts가 끝냈고,
// 여기서는 그 결과를 사람 말로 옮기기만 한다 (CLAUDE.md 절대 규칙 1).
// 원본 페이지 HTML/텍스트는 절대 전달하지 않는다 (CLAUDE.md 절대 규칙 2).

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { LlmExplanation, ScanFacts, ScoreResult } from './types';

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `너는 청소년에게 인터넷 링크의 위험을 설명해주는 안내자다.

## 역할의 한계 (반드시 지킬 것)
- 위험도 판정은 이미 끝나 있다. 너는 판정을 내리는 사람이 아니라, 내려진 판정을 사람 말로 옮기는 사람이다.
- 입력으로 받은 JSON 데이터에 있는 사실만 사용한다. 데이터에 없는 내용은 절대 지어내지 않는다.
- 입력 데이터의 verdict(판정) 값을 바꾸거나 반박하지 않는다. verdict가 "danger"인데 "안전해 보인다"고 쓰면 안 된다.
- 특정 회사·개인을 범인으로 단정하지 않는다. "이 사이트는 ~로 보인다" 수준으로 서술한다.
- 데이터가 부족한 항목은 그 항목을 생략한다. 추측으로 채우지 않는다.
- verdict가 "content_restricted"인 경우, 이미 "국내 법률에 따라 방송통신심의위원회의 차단 대상"이라는 법적
  판단이 별도 문구로 사용자에게 먼저 표시된다. 너는 그 판단을 반박하거나 다른 표현으로 재진술하지 않는다.
  story에는 그 판단에 대한 짧은 부연 설명만 담는다 — 예를 들어 보안 위험 신호 없이도 이런 사이트가 왜
  문제가 되는지, 왜 청소년에게 맞지 않는지. "계정이 털린다", "정보가 유출된다" 같은 피싱 서사는 쓰지 않는다.
- scan_data에 target_unreachable이 true이면, 지금은 그 주소로 들어가지지 않는다는 것(이미 차단됐거나 사라짐)을
  story에 자연스럽게 담는다. evidence에 다른 위험 신호가 있다면 "그래도 예전엔 위험했을 수 있으니 이 링크 자체는
  누르거나 전달하지 마세요"라는 취지를 덧붙이고, 없다면 사라진 사이트라는 사실만 담담하게 전달한다.
  urlscan 관련 항목(비밀번호 입력칸, 리다이렉트 등)은 데이터가 없으므로 언급하지 않는다.
- scan_data.virustotal.categories가 빈 배열이 아니면, 이 사이트가 어떤 종류의 사이트로 분류돼 있는지
  evidence에 반드시 한 줄 포함한다. (예: categories에 "piracy"가 있으면 "여러 보안업체가 이 사이트를
  저작권을 침해하는 불법 콘텐츠 사이트로 분류해뒀어요" 식으로.) target_unreachable이 true여서 urlscan이
  실제 화면을 보지 못했더라도, VirusTotal의 카테고리 분류는 사이트에 실제로 접속하지 않고도 알 수 있는
  정보이므로 그대로 유효하다 — "지금은 못 들어가지만, 여러 보안업체는 이 사이트를 [카테고리]로 분류해왔어요"처럼
  두 사실을 자연스럽게 같이 전달한다. categories 값이 harmful_content_hint가 다루는 사설 도박/성인물/불법
  스트리밍 범주에 정확히 안 들어맞더라도(예: 뉴스, 쇼핑, 스트리밍 등) 사이트 정체를 아는 것 자체가 사용자에게
  중요한 정보이니 생략하지 않는다.

## 말투
- 읽는 사람은 13~18세 청소년이다. 중학생이 이해할 수 있는 단어만 쓴다.
- 기술 용어(도메인, 리다이렉트, SSL, 페이로드 등)를 그대로 쓰지 않고 풀어서 쓴다.
  예: "도메인 생성 3일" → "이 사이트는 만들어진 지 3일밖에 안 됐어요"
- 겁주거나 혼내지 않는다. 이미 당한 사람이 읽을 수도 있다. 담담하고 차분하게 설명한다.
- "너 왜 눌렀어" 같은 책망, "큰일 났다" 같은 과장은 금지한다.
- 문장은 짧게. 한 문장에 한 가지 내용만.

## 출력 형식
반드시 아래 JSON만 출력한다. 코드 블록 표시나 설명 문장을 앞뒤에 붙이지 않는다.

{
  "summary": "한 줄 요약. 이 링크의 정체를 한 문장으로. 40자 이내.",
  "story": "이 사이트가 어떤 곳인지 설명. 2~4문장. '무슨 사이트냐면...'이라는 제목 아래 보여줄 내용이므로, 미래에 벌어질 일이 아니라 지금 이 사이트의 정체·특징을 설명하는 톤으로 서술.",
  "evidence": [
    { "icon": "🕐", "text": "판단 근거 한 줄. 기술용어 없이." }
  ],
  "tips": [
    "다음에 비슷한 링크를 스스로 알아보는 방법. 이 사례에 기반한 구체적인 팁."
  ]
}

- evidence는 3~5개. 입력 데이터에 실제로 존재하는 항목만.
- tips는 2~3개.
- verdict가 "safe"인 경우: story는 "특별히 위험한 점은 발견되지 않았어요" 취지로 쓰되,
  tips에는 "검사가 완벽하지는 않으니 조금이라도 이상하면 누르지 마세요"를 반드시 포함한다.
- verdict가 "content_restricted"인 경우: summary와 story 모두 이미 표시된 법적 고지 문구와 모순되지
  않아야 한다. "위험한 사이트"라는 표현 대신 "접속이 제한되는 사이트" 톤을 쓴다.`;

const LlmOutputSchema = z.object({
  summary: z.string().max(60),
  story: z.string(),
  evidence: z.array(z.object({ icon: z.string(), text: z.string() })).min(1).max(6),
  tips: z.array(z.string()).min(1).max(4),
});

function buildUserMessage(facts: ScanFacts, score: ScoreResult): string {
  return `아래는 보안 검사 도구들이 이 링크를 실제로 검사한 결과입니다.
이 데이터만 사용해서 JSON을 작성하세요.

<scan_data>
${JSON.stringify(facts)}
</scan_data>

<verdict>
판정: ${score.verdict}
위험 점수: ${score.total}
점수 산출에 기여한 신호: ${JSON.stringify(score.signals.map((signal) => signal.label))}
</verdict>`;
}

function extractJson(text: string): unknown {
  // 프롬프트에서 코드 블록을 쓰지 말라고 지시했지만, 방어적으로 벗겨낸다.
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(stripped);
}

async function callLlmOnce(client: Anthropic, facts: ScanFacts, score: ScoreResult): Promise<LlmExplanation> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(facts, score) }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('LLM 응답에 텍스트가 없어요');
  }

  const parsed = extractJson(textBlock.text);
  return LlmOutputSchema.parse(parsed);
}

const FALLBACK_TEXT: Record<Exclude<ScoreResult['verdict'], 'content_restricted'>, { summary: string; story: string; tips: string[] }> = {
  danger: {
    summary: '위험한 링크로 확인됐어요',
    story: '여러 보안 검사에서 이 링크가 위험하다고 판단했어요. 누르지 마시고, 보낸 사람을 차단하세요.',
    tips: [
      '잘 모르는 사람이 보낸 링크는 누르기 전에 항상 확인하세요.',
      '아이디·비밀번호는 앱에 직접 들어가서만 입력하세요.',
    ],
  },
  caution: {
    summary: '의심스러운 점이 있어요',
    story: '확실히 위험하다고 하긴 어렵지만 이상한 점이 발견됐어요. 아는 사람이 보낸 게 아니라면 누르지 마세요.',
    tips: [
      '주소가 진짜 사이트와 조금이라도 다르면 의심하세요.',
      '아이디·비밀번호는 앱에 직접 들어가서만 입력하세요.',
    ],
  },
  safe: {
    summary: '특별한 위험은 찾지 못했어요',
    story: '검사에서 위험 신호가 나오지 않았어요. 다만 검사가 완벽하지는 않으니 조금이라도 이상하면 누르지 마세요.',
    tips: ['검사가 완벽하지는 않으니 조금이라도 이상하면 누르지 마세요.'],
  },
};

const CONTENT_RESTRICTED_FALLBACK_TIPS = [
  '이런 사이트는 친구가 보내줘도 들어가지 않는 게 안전해요.',
  '검사가 완벽하지는 않으니 조금이라도 이상하면 누르지 마세요.',
];

const UNREACHABLE_FALLBACK_TIPS = [
  '사라진 사이트라도 그 링크를 다른 사람에게 전달하지 마세요.',
  '검사가 완벽하지는 않으니 조금이라도 이상하면 누르지 마세요.',
];

/**
 * VirusTotal이 분류해둔 원본 카테고리를 그대로 근거로 보여준다. score.ts의
 * harmful_content_hint는 도박/성인/불법복제 3개 버킷에 안 걸리면 아무 신호도
 * 만들지 않는데, 그 경우에도 "이 사이트가 뭔지" 자체는 사용자에게 중요한
 * 정보이므로 판정 점수와 무관하게 항상 보여준다. urlscan이 실제 화면을 못
 * 봤어도(target_unreachable) VT의 카테고리 분류는 사이트에 접속하지 않고도
 * 알 수 있는 정보라 그대로 유효하다.
 */
function buildCategoryEvidence(facts: ScanFacts): { icon: string; text: string } | null {
  const categories = facts.virustotal?.categories ?? [];
  if (categories.length === 0) return null;
  return { icon: '🏷️', text: `여러 보안업체는 이 사이트를 "${categories.join(', ')}"(으)로 분류해뒀어요` };
}

/**
 * LLM 호출이 실패했을 때 사용하는 템플릿 폴백 (PRD 부록 C.5, 7.4).
 * score.ts가 계산한 신호를 그대로 근거로 보여준다.
 *
 * target_unreachable(urlscan.io가 DNS 조회조차 못한 경우)이 가장 먼저 확인해야 할
 * 사실이므로 다른 분기보다 우선한다 — "이미 사라진 사이트"라는 사실 자체가
 * verdict별 기본 문구보다 사용자에게 더 중요하다.
 *
 * verdict가 content_restricted면 계정 탈취(피싱)와는 다른, 콘텐츠 자체가 국내 법상 접속 제한
 * 대상이라는 별도 문구를 쓴다 — score.ts가 이미 보안 신호 유무를 판정에 반영했으므로 여기서는
 * verdict만 보고 분기하면 된다.
 */
export function buildFallbackExplanation(facts: ScanFacts, score: ScoreResult): LlmExplanation {
  const categoryEvidence = buildCategoryEvidence(facts);
  const evidence = [
    ...score.signals.map((signal) => ({ icon: '•', text: signal.label })),
    ...(categoryEvidence ? [categoryEvidence] : []),
  ];

  if (facts.target_unreachable) {
    const hasRiskSignal = score.signals.length > 0;
    const categories = facts.virustotal?.categories ?? [];
    const categoryNote =
      categories.length > 0 ? ` 보안업체들은 이 사이트를 "${categories.join(', ')}"(으)로 분류해왔어요.` : '';
    const baseStory = hasRiskSignal
      ? '지금은 이 주소로 들어가지지 않아요. 이미 차단됐거나 사라진 것 같아요. 다만 예전 기록을 보면 위험했던 사이트일 수 있으니, 이 링크는 누르지도 전달하지도 마세요.'
      : '지금은 이 주소로 들어가지지 않아요. 이미 차단됐거나 사라진 것 같아요.';
    return {
      summary: '이미 사라졌거나 차단된 페이지예요',
      story: baseStory + categoryNote,
      evidence: [{ icon: '🚫', text: '지금은 이 주소로 연결되지 않아요' }, ...evidence],
      tips: UNREACHABLE_FALLBACK_TIPS,
    };
  }

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

/**
 * 구조화된 검사 데이터와 확정된 판정을 받아 LLM 서사 설명을 생성한다.
 * 이 함수는 절대 예외를 던지지 않는다 — 실패하면 항상 템플릿 폴백을 반환한다.
 * facts.urlscan/virustotal 등 구조화된 필드값만 전달하며 원본 페이지 콘텐츠는 포함하지 않는다.
 */
export async function generateExplanation(facts: ScanFacts, score: ScoreResult): Promise<LlmExplanation> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY가 설정되지 않았어요. 폴백 설명을 사용해요.');
    return buildFallbackExplanation(facts, score);
  }

  const client = new Anthropic({ apiKey });

  try {
    return await callLlmOnce(client, facts, score);
  } catch (firstError) {
    console.error('LLM 호출 1차 실패, 재시도해요:', firstError);
    try {
      return await callLlmOnce(client, facts, score);
    } catch (secondError) {
      console.error('LLM 호출 2차 실패, 폴백으로 전환해요:', secondError);
      return buildFallbackExplanation(facts, score);
    }
  }
}
