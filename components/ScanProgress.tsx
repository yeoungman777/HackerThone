const STEPS = [
  "링크 주소 확인",
  "보안 데이터베이스 대조",
  "안전한 가상 환경에서 페이지 열어보는 중",
  "결과 정리",
];

export default function ScanProgress({
  currentStep,
  progress,
}: {
  /** 0~3. 이 인덱스보다 작은 단계는 완료로, 같은 단계는 진행 중으로 표시한다. */
  currentStep: number;
  /** 0~100 진행률 (실제 소요시간을 알 수 없어 추정치를 표시한다). */
  progress: number;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <h1 className="text-lg font-bold">링크를 확인하는 중</h1>
      <p className="text-sm text-foreground/60">보통 20~40초 걸려요</p>

      <ul className="w-full space-y-3 text-left">
        {STEPS.map((label, index) => {
          const isDone = index < currentStep;
          const isActive = index === currentStep;
          return (
            <li
              key={label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                isActive
                  ? "bg-foreground/5 font-semibold"
                  : isDone
                    ? "text-foreground/50"
                    : "text-foreground/30"
              }`}
            >
              <span className="w-5 shrink-0 text-center">
                {isDone ? "✅" : isActive ? "⏳" : "⬜"}
              </span>
              {label}
            </li>
          );
        })}
      </ul>

      <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="text-xs text-foreground/50">이 화면을 닫지 마세요</p>
    </div>
  );
}
