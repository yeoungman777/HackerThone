const STEPS: { active: string; done: string }[] = [
  { active: "보내주신 링크를 확인 중입니다.", done: "링크가 확인되었습니다." },
  { active: "보안 데이터베이스와 대조중입니다.", done: "보안 데이터베이스 대조가 완료되었습니다." },
  {
    active: "안전한 가상환경에서 페이지를 열어보는 중입니다.",
    done: "안전한 가상환경에서 페이지 확인을 마쳤습니다.",
  },
  { active: "결과를 정리하고 있습니다.", done: "결과 정리가 완료되었습니다." },
];

function StepLabel({ step, isDone }: { step: { active: string; done: string }; isDone: boolean }) {
  if (!isDone) return <>{step.active}</>;

  return (
    <span className="relative inline-block">
      <span className="text-foreground/50">{step.done}</span>
      <span
        aria-hidden
        className="animate-fill-reveal absolute inset-0 overflow-hidden whitespace-nowrap text-green-600 dark:text-green-400"
      >
        {step.done}
      </span>
    </span>
  );
}

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
    <div className="animate-rise-in flex flex-col items-center gap-6 py-12 text-center">
      <h1 className="text-lg font-bold">링크를 확인하는 중</h1>
      <p className="text-sm text-foreground/60">보통 20~40초 걸려요</p>

      <ul className="w-full space-y-3 text-left">
        {STEPS.map((step, index) => {
          const isDone = index < currentStep;
          const isActive = index === currentStep;
          return (
            <li
              key={step.active}
              className={`rounded-lg px-3 py-2 text-sm transition-colors duration-500 ${
                isActive
                  ? "bg-foreground/5 font-semibold"
                  : isDone
                    ? "font-medium"
                    : "text-foreground/30"
              }`}
            >
              <StepLabel step={step} isDone={isDone} />
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
