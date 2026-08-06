import type { ComponentType } from "react";
import type { ScoreResult } from "@/lib/types";

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 5-5" />
    </svg>
  );
}

function TriangleAlertIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5 21 19H3z" />
      <line x1="12" y1="9" x2="12" y2="13.5" />
      <circle cx="12" cy="16.7" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CircleBanIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  );
}

const VERDICT_STYLE: Record<
  ScoreResult["verdict"],
  { label: string; className: string; Icon: ComponentType }
> = {
  danger: {
    label: "위험한 사이트입니다",
    className:
      "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    Icon: XCircleIcon,
  },
  caution: {
    label: "주의가 필요한 사이트입니다",
    className:
      "border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
    Icon: TriangleAlertIcon,
  },
  content_restricted: {
    label: "접속 제한 대상 사이트입니다",
    className:
      "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    Icon: CircleBanIcon,
  },
  safe: {
    label: "안전한 사이트입니다",
    className:
      "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
    Icon: CheckCircleIcon,
  },
};

export default function VerdictBadge({
  verdict,
}: {
  verdict: ScoreResult["verdict"];
}) {
  const { label, className, Icon } = VERDICT_STYLE[verdict];
  return (
    <div
      className={`animate-rise-in inline-flex w-fit shrink-0 items-center gap-3 self-start rounded-xl border-l-[6px] py-3 pl-4 pr-6 text-lg font-bold ${className}`}
    >
      <Icon />
      <span>{label}</span>
    </div>
  );
}
