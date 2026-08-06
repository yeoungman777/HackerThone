import type { ScoreResult } from "@/lib/types";

const VERDICT_STYLE: Record<
  ScoreResult["verdict"],
  { emoji: string; label: string; className: string }
> = {
  danger: {
    emoji: "🔴",
    label: "위험해요",
    className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  caution: {
    emoji: "🟡",
    label: "주의가 필요해요",
    className:
      "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  },
  safe: {
    emoji: "🟢",
    label: "안전해 보여요",
    className:
      "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
};

export default function VerdictBadge({
  verdict,
}: {
  verdict: ScoreResult["verdict"];
}) {
  const style = VERDICT_STYLE[verdict];
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-2xl py-8 text-center ${style.className}`}
    >
      <span className="text-5xl">{style.emoji}</span>
      <span className="text-xl font-bold">{style.label}</span>
    </div>
  );
}
