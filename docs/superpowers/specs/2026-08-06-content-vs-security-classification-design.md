# 위험 분류 체계 개편: 보안 위험 vs 부적절 콘텐츠 분리

## 배경

현재 `lib/score.ts`는 보안 위험 신호(악성 엔진 탐지, 피싱 패턴, HTTPS 미사용, 리다이렉트 등)와
콘텐츠 부적절 신호(`harmful_content_hint` — 도박·성인물·불법 복제물)를 하나의 점수에 더해서
`danger / caution / safe` 3단계로만 판정한다. 그 결과 실제 보안 위험이 없는 성인/도박 사이트가
보안 위험 사이트와 같은 "위험" 계열로 뭉뚱그려진다.

이 개편의 목표는 두 축을 명확히 분리해서:
- **실제 보안 위험**(악성코드, 계정 탈취형 피싱)이 있는 사이트는 최상위 경고 등급으로 분류하고
- **보안 문제는 없지만 국내 법상 접속 제한 대상**(사설 도박·성인물·불법 스트리밍)인 사이트는
  별도의, 덜 위협적인 톤의 등급으로 분류한다.

## 분류 로직 (`lib/score.ts`)

4단계 판정을 아래 **우선순위 순서**로 평가한다 (먼저 매치되는 조건이 최종 verdict):

```
1. engines_malicious >= 1
   OR (has_password_input && brand_impersonation_hint)      → danger (접근금지)
2. domain_age_days <= 30
   OR !uses_https
   OR redirect_count >= 3                                    → caution (주의)
3. harmful_content_hint 존재 (도박/성인물/불법스트리밍)         → content_restricted (신규)
4. 위 조건 모두 미해당                                         → safe
```

- 보안 신호가 하나라도 있으면(1, 2번) 콘텐츠 신호와 무관하게 보안 등급이 우선한다.
  (예: 도박 사이트인데 악성코드도 있으면 → danger. 도박 사이트인데 도메인이 최근 생성됐으면 → caution.)
- `has_password_input && brand_impersonation_hint`(브랜드 사칭 + 비밀번호 입력창)는 VirusTotal이
  아직 탐지하지 못한 상태여도 danger로 승격한다 — 정교한 피싱 패턴 자체가 실제 보안 위험이라는 판단.
- `engines_malicious >= 3`는 더 이상 verdict 산출에 쓰지 않는다. 다만 danger가 이미 다른 조건으로
  확정된 상태에서 `engines_malicious >= 3`이면, `signals` 배열에 `{ label: "여러 보안 검사가 동시에
  위험하다고 판단했어요", weight: 0 }`를 추가해 evidence에는 노출하되 점수 계산에는 영향을 주지 않는다.
- `signals: { label, weight }[]` 구조는 유지하되, weight는 UI에 노출되지 않는 내부 정렬/디버깅
  용도로만 남긴다 (현재도 UI에 숫자 점수를 노출하지 않음).

### 콘텐츠 카테고리 라벨 변경

`HARMFUL_CATEGORY_RULES`의 표시 라벨을 법적 문구와 맞춘다:

| 기존 라벨 | 변경 후 라벨 |
|---|---|
| 도박 | 사설 도박 |
| 성인 콘텐츠 | 성인물 |
| 불법 복제물 | 불법 스트리밍 |

키워드 매칭 규칙(`keywords` 배열) 자체는 변경하지 않는다.

## content_restricted 전용 처리

### 고정 법적 고지 문구

`verdict === 'content_restricted'`일 때 아래 문장을 **코드에서 고정 생성**한다 (LLM 미개입):

> "해킹이나 악성코드 위험은 발견되지 않았으나, 국내 법률에 따라 방송통신심의위원회의 차단 대상이 되는
> [카테고리] 관련 페이지로 판단됩니다."

`[카테고리]`는 감지된 `harmful_content_hint` 값으로 치환한다 (예: "사설 도박").

이 문구를 생성하는 함수를 `lib/score.ts`에 추가한다 (`buildLegalNotice(facts, verdict): string | null`).
verdict가 `content_restricted`가 아니면 `null`을 반환한다.

### LLM 프롬프트 변경 (`lib/llm.ts`)

- 시스템 프롬프트에 새 규칙 추가: `verdict`가 `content_restricted`인 경우, 이미 내려진 법적 판단
  문구를 반박·재해석·다른 표현으로 바꿔 쓰지 않는다. `story`에는 그 판단에 대한 **부연 설명만**
  (예: 왜 이런 사이트가 위험 신호 없이도 문제가 되는지, 왜 학생에게 안 맞는지) 짧게 덧붙인다.
- `summary` 필드도 법적 고지와 모순되지 않게, 예컨대 "접속 제한 대상 사이트예요" 톤으로 제한한다.
- `buildFallbackExplanation`(LLM 실패 시 폴백)에도 `content_restricted` 분기를 추가한다. 기존에
  있던 "harmful_content_hint만 있고 계정탈취 신호는 없을 때" 특수 분기 로직은 이제 verdict 자체가
  `content_restricted`이므로 그 조건으로 대체한다 (`hasAccountTakeoverSignal` 체크 삭제 가능).

## 타입 변경 (`lib/types.ts`)

```ts
export interface ScoreResult {
  total: number;
  verdict: 'safe' | 'caution' | 'content_restricted' | 'danger';
  signals: { label: string; weight: number }[];
}

export interface ScanResult {
  facts: ScanFacts;
  score: ScoreResult;
  explanation: LlmExplanation;
  /** verdict === 'content_restricted'일 때만 값이 있는 고정 법적 고지 문구 */
  legalNotice: string | null;
  partial: boolean;
}
```

`app/api/scan/route.ts`에서 `calculateScore` 이후 `buildLegalNotice`를 호출해 `legalNotice`를
`ScanResult`에 채워 넣는다.

## UI 변경

### `components/VerdictBadge.tsx`

`content_restricted` 항목 추가:

```ts
content_restricted: {
  emoji: "🟠",
  label: "접속은 되지만 제한 대상이에요",
  className: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
}
```

### `app/result/page.tsx`

`result.legalNotice`가 존재하면 `VerdictBadge` 바로 아래에 강조 박스로 표시한다 (주황 톤 배경,
고정 문구 그대로 렌더링). 그 아래 기존 `explanation.story`("눌렀다면 벌어졌을 일") 섹션은 그대로
유지하되, 이 경우 LLM이 생성한 부연 설명이 들어간다.

## 테스트 계획

- `lib/score.test.ts` (신규):
  - danger: 악성 엔진 1개 이상 단독으로 danger인지
  - danger: 악성 엔진 0개 + 비밀번호입력창 + 브랜드사칭 조합으로 danger인지
  - danger: 악성 엔진 있음 + harmful_content_hint 있음 동시 존재 시 danger가 우선하는지 (콘텐츠 신호 무시 확인)
  - caution: 도메인 나이 30일 이하 단독으로 caution인지 (harmful_content_hint 없을 때)
  - caution: 보안 신호(도메인 나이) + harmful_content_hint 동시 존재 시 caution이 우선하는지 (content_restricted 아님을 확인)
  - content_restricted: 보안 신호 전혀 없고 harmful_content_hint만 있을 때
  - safe: 아무 신호도 없을 때
  - `buildLegalNotice`: content_restricted일 때 카테고리가 올바르게 치환되는지, 다른 verdict일 때 null인지
- `lib/llm.test.ts`: `buildFallbackExplanation`의 content_restricted 분기 (라벨 포함 문구 확인)

## 범위 밖 (Out of scope)

- 실제 URL 접속을 서버 단에서 차단하는 기능은 없음 — 이 앱은 판정/안내만 제공하고 접근 자체를
  막지는 않는다 ("접근금지"는 UI 라벨일 뿐).
- 방송통신심의위원회 차단 목록 API 연동 등 실제 법적 데이터 소스 조회는 하지 않는다 — 판정은
  기존과 동일하게 VirusTotal categories 기반 휴리스틱이다.
