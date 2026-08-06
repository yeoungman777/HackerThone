// 대처 체크리스트 정적 데이터 (PRD 부록 D). LLM을 거치지 않는다.
// 플랫폼 x 행동 조합으로 항목을 조회하고, 선택된 행동을 모두 합쳐 중복 없는 체크리스트를 만든다.

import type { RecoveryAction, RecoveryPlatform } from "@/lib/types";

interface RecoverySection {
  /** 화면에 굵게 강조해서 보여줄 경고 문단 (예: QR 로그인 스캠 설명) */
  note?: string;
  /** 순서대로 따라 하는 체크리스트 항목. 실제 메뉴 경로를 포함한다. */
  items: string[];
}

export interface RecoveryChecklist {
  /** 사진을 보냈거나 돈을 보낸 경우 true — 어른에게 알리라는 문구를 최상단에 노출한다 */
  urgent: boolean;
  /** 선택된 행동에 딸린 강조 경고 문단들 */
  notes: string[];
  /** 중복이 제거된 순서대로의 체크리스트 항목 */
  items: string[];
}

/** 모든 화면 상단에 공통으로 노출하는 안심 문구 (PRD 부록 D.0) */
export const COMMON_INTRO = [
  "당신 잘못이 아니에요. 이런 링크는 어른들도 속습니다.",
  "지금부터 하나씩 하면 됩니다. 순서대로만 따라오세요.",
];

/** 사진을 보냈거나 돈을 보낸 경우 최상단에 우선 노출하는 문구 (PRD 부록 D.0) */
export const URGENT_NOTICE =
  '혼자 해결하려고 하지 마세요. 부모님, 선생님 등 믿을 수 있는 어른에게 지금 알리세요. 상대가 "어른에게 말하면 퍼뜨린다"고 해도, 그 말을 따르면 상황은 더 나빠집니다.';

/** 신고·상담 창구 (PRD 부록 D.4, 하단 고정) */
export const REPORT_CONTACTS: { situation: string; contact: string }[] = [
  { situation: "긴급 / 금전 피해", contact: "112 (경찰)" },
  {
    situation: "사이버범죄 신고",
    contact: "경찰청 사이버범죄 신고시스템(ECRM) — ecrm.police.go.kr",
  },
  { situation: "해킹·개인정보 유출", contact: "한국인터넷진흥원 118" },
  { situation: "청소년 고민 상담", contact: "청소년상담 1388 (전화·문자·카톡)" },
  {
    situation: "사진 유출·협박",
    contact: "디지털성범죄피해자지원센터 — d4u.stop.or.kr (사진 삭제 지원)",
  },
  { situation: "학교 관련", contact: "담임 선생님 또는 학교전담경찰관(SPO)" },
];

// 사진을 보냈다 / 협박받고 있다 — 플랫폼과 무관하게 같은 대응이 적용된다 (PRD D.1.D)
const SHARED_PHOTO_SECTION: RecoverySection = {
  items: [
    "돈을 보내지 마세요. 한 번 보내면 계속 요구합니다.",
    "대화를 지우지 마세요. 증거가 됩니다. 화면 캡처로 남기세요.",
    "상대를 차단하고, 더는 답하지 마세요.",
    "믿을 수 있는 어른에게 알리세요.",
    "전문 상담 창구에 연락하세요. 사진 삭제를 도와주는 곳이 있습니다.",
  ],
};

// 돈을 보냈다 — 플랫폼과 무관하게 같은 대응이 적용된다 (PRD D.3.D)
const SHARED_MONEY_SECTION: RecoverySection = {
  items: [
    "즉시 은행에 전화해 지급정지를 요청하세요. (빠를수록 회수 가능성이 높아요)",
    "경찰에 신고하세요. (112 또는 사이버범죄 신고시스템)",
    "이체 내역, 대화 내용을 전부 캡처해 보관하세요.",
  ],
};

type PlatformSections = Partial<Record<RecoveryAction, RecoverySection>>;

const INSTAGRAM: PlatformSections = {
  clicked: {
    items: [
      "아무것도 입력하지 않았다면 대부분 괜찮아요. 아래만 확인하세요.",
      "인스타 앱 → 설정 → 계정 센터 → 비밀번호 및 보안 → 로그인 활동에서 모르는 기기가 있는지 확인하세요.",
      "그 링크를 보낸 계정을 차단하고 신고하세요. (프로필 우측 상단 ⋯ → 신고)",
      "휴대폰에 모르는 앱이 설치되지 않았는지 확인하세요.",
    ],
  },
  credentials: {
    items: [
      "지금 바로 인스타 비밀번호를 바꾸세요. (설정 → 계정 센터 → 비밀번호 및 보안 → 비밀번호 변경)",
      "로그인 활동을 확인해서 내 기기가 아닌 것은 전부 로그아웃하세요.",
      "2단계 인증을 켜세요. (설정 → 계정 센터 → 비밀번호 및 보안 → 2단계 인증)",
      "설정 → 계정 센터 → 연결된 앱·웹사이트에서 모르는 항목을 전부 연결 해제하세요.",
      "등록된 이메일·전화번호가 내 것이 맞는지 확인하세요. (범인이 바꿔놨을 수 있어요)",
      "같은 비밀번호를 쓴 다른 서비스도 전부 바꾸세요.",
      "내 계정이 친구들에게 이상한 DM을 보냈는지 확인하고, 받은 사람에게 알리세요.",
      '이미 로그인이 안 된다면 로그인 화면의 "로그인에 문제가 있나요?"에서 해킹 신고 절차를 진행하세요.',
    ],
  },
  app: {
    items: [
      "해당 앱을 즉시 삭제하세요.",
      "Android는 설정 → 보안 → 기기 관리자 앱에서 권한을 해제한 뒤 삭제하고, iOS는 설정 → 일반 → VPN 및 기기 관리에서 모르는 프로필을 삭제하세요.",
      "휴대폰 보안 검사를 실행하세요.",
      "인스타를 포함한 모든 계정 비밀번호를 바꾸세요. (앱이 입력을 훔쳐봤을 수 있어요)",
      "통신사에 소액결제 차단을 신청하세요.",
    ],
  },
  photo: SHARED_PHOTO_SECTION,
  money: SHARED_MONEY_SECTION,
};

const DISCORD: PlatformSections = {
  clicked: {
    items: [
      "사용자 설정 → 데이터 및 개인정보 보호 → 세션에서 모르는 기기를 로그아웃하세요.",
      "해당 사용자를 차단하고 서버에 신고하세요.",
      "모르는 서버에 들어가 있다면 나가세요.",
    ],
  },
  credentials: {
    note:
      '디스코드는 QR 로그인 스캠이 흔합니다. "니트로 무료" 등의 미끼로 QR을 찍게 하면 계정이 즉시 탈취됩니다.',
    items: [
      "지금 바로 비밀번호를 바꾸세요. (사용자 설정 → 내 계정 → 비밀번호 변경)",
      '비밀번호 변경 시 "다른 모든 기기에서 로그아웃" 옵션을 체크하세요.',
      "2단계 인증(2FA)을 활성화하세요.",
      "사용자 설정 → 승인된 앱에서 모르는 앱을 전부 제거하세요.",
      "등록된 이메일이 내 것이 맞는지 확인하세요.",
      "내 계정이 친구·서버에 스팸 링크를 뿌렸는지 확인하고 알리세요.",
      "계정에 결제수단이 등록돼 있었다면 카드사에 확인하세요.",
    ],
  },
  app: {
    note: "디스코드는 악성 파일 유포가 많습니다.",
    items: [
      "파일을 즉시 삭제하고 백신 검사를 실행하세요.",
      "디스코드 토큰이 탈취됐을 수 있으니 비밀번호 변경 후 전체 기기 로그아웃을 꼭 하세요.",
      "브라우저에 저장된 비밀번호가 유출됐을 수 있으니 주요 계정 비밀번호를 전부 바꾸세요.",
      "어른에게 알리고 PC 점검을 받으세요.",
    ],
  },
  photo: SHARED_PHOTO_SECTION,
  money: SHARED_MONEY_SECTION,
};

const KAKAO: PlatformSections = {
  clicked: {
    items: [
      "더보기 → 설정 → 개인/보안 → 카카오계정 → 로그인 기기 관리에서 모르는 기기를 로그아웃하세요.",
      "상대를 차단하고 신고하세요. (채팅방 → 신고하기)",
      "오픈채팅이라면 채팅방을 나가세요.",
    ],
  },
  credentials: {
    items: [
      "지금 바로 카카오계정 비밀번호를 바꾸세요. (accounts.kakao.com)",
      "로그인 기기 관리에서 모르는 기기를 전부 로그아웃하세요.",
      "2단계 인증을 설정하세요.",
      "연결된 서비스 목록에서 모르는 앱을 연결 해제하세요.",
      "같은 비밀번호를 쓴 다른 서비스도 전부 바꾸세요.",
      "내 계정으로 친구들에게 돈을 빌려달라는 메시지가 갔는지 확인하고, 갔다면 친구들에게 즉시 알리세요.",
    ],
  },
  app: {
    note: "카톡으로 퍼지는 APK 설치는 문자·연락처·인증번호 탈취로 이어집니다. 가장 위험한 상황이에요.",
    items: [
      "휴대폰을 비행기 모드로 전환하세요. (원격 조종 차단)",
      "어른에게 즉시 알리세요.",
      "통신사에 연락해 소액결제 차단과 명의도용 확인을 요청하세요.",
      "은행 앱에서 계좌 이체 내역을 확인하고, 이상하면 은행에 지급정지를 요청하세요.",
      "앱을 삭제한 뒤에도 불안하면 어른과 함께 휴대폰 초기화를 고려하세요.",
      "경찰(112) 또는 신고·상담 창구에 신고하세요.",
    ],
  },
  photo: SHARED_PHOTO_SECTION,
  money: SHARED_MONEY_SECTION,
};

// PRD 부록 D는 인스타그램/디스코드/카카오톡만 다룬다.
// "기타"는 플랫폼별 메뉴 경로를 알 수 없으므로 서비스 공통으로 통하는 일반 대응으로 구성한다.
const OTHER: PlatformSections = {
  clicked: {
    items: [
      "아무것도 입력하지 않았다면 대부분 괜찮아요.",
      "그 서비스에 로그인 기록(로그인 활동/보안 알림)을 확인할 수 있다면 모르는 기기가 있는지 확인하세요.",
      "링크를 보낸 사람이나 계정을 차단하고 신고하세요.",
    ],
  },
  credentials: {
    items: [
      "지금 바로 그 계정의 비밀번호를 바꾸세요.",
      "로그인 기기 목록이 있다면 확인하고 모르는 기기는 로그아웃하세요.",
      "2단계 인증이 있다면 켜세요.",
      "같은 비밀번호를 쓴 다른 서비스도 전부 바꾸세요.",
      "계정이 다른 사람에게 이상한 메시지를 보냈는지 확인하고, 받은 사람에게 알리세요.",
    ],
  },
  app: {
    items: [
      "해당 앱을 즉시 삭제하세요.",
      "휴대폰 보안 검사를 실행하세요.",
      "중요한 계정들의 비밀번호를 바꾸세요. (앱이 입력을 훔쳐봤을 수 있어요)",
      "통신사·카드 내역에 이상한 결제가 없는지 확인하세요.",
    ],
  },
  photo: SHARED_PHOTO_SECTION,
  money: SHARED_MONEY_SECTION,
};

const PLATFORM_SECTIONS: Record<RecoveryPlatform, PlatformSections> = {
  instagram: INSTAGRAM,
  discord: DISCORD,
  kakao: KAKAO,
  other: OTHER,
};

// 여러 행동이 선택됐을 때 보여주는 순서. PRD 화면 4의 선택지 순서와 같다.
const ACTION_ORDER: RecoveryAction[] = [
  "clicked",
  "credentials",
  "app",
  "photo",
  "money",
];

/** 플랫폼과 선택된 행동들을 조합해 중복 없는 체크리스트를 만든다. */
export function getRecoveryChecklist(
  platform: RecoveryPlatform,
  actions: RecoveryAction[]
): RecoveryChecklist {
  const selected = new Set(actions);
  const sections = ACTION_ORDER.filter((action) => selected.has(action))
    .map((action) => PLATFORM_SECTIONS[platform][action])
    .filter((section): section is RecoverySection => Boolean(section));

  const seen = new Set<string>();
  const items: string[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      if (!seen.has(item)) {
        seen.add(item);
        items.push(item);
      }
    }
  }

  const notes = sections
    .map((section) => section.note)
    .filter((note): note is string => Boolean(note));

  return {
    urgent: selected.has("photo") || selected.has("money"),
    notes,
    items,
  };
}
