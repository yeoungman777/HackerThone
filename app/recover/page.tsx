"use client";

import { useState } from "react";
import Link from "next/link";
import {
  COMMON_INTRO,
  REPORT_CONTACTS,
  URGENT_NOTICE,
  getRecoveryChecklist,
} from "@/data/recovery";
import type { RecoveryAction, RecoveryPlatform } from "@/lib/types";

const PLATFORMS: { value: RecoveryPlatform; label: string }[] = [
  { value: "instagram", label: "인스타그램" },
  { value: "discord", label: "디스코드" },
  { value: "kakao", label: "카카오톡" },
  { value: "message", label: "메시지" },
  { value: "found_online", label: "인터넷에서 발견돼서 눌러봄" },
  { value: "other", label: "기타" },
];

const ACTIONS: { value: RecoveryAction; label: string }[] = [
  { value: "clicked", label: "링크만 눌렀어요" },
  { value: "credentials", label: "아이디·비밀번호를 입력했어요" },
  { value: "app", label: "앱을 설치했어요" },
  { value: "photo", label: "사진을 보냈어요" },
  { value: "money", label: "돈을 보냈어요" },
];

const LIGHT_SELF_CHECKS = [
  "혹시 모르니 로그인 기록에 낯선 기기가 있는지 한 번 확인해보세요.",
  "찜찜하다면 비밀번호를 한 번 바꿔두면 더 안심될 거예요.",
  "다음부터는 모르는 링크를 누르기 전에 먼저 확인하는 습관을 들여보세요.",
];

type Stage = "screening" | "reassurance" | "select" | "checklist";

export default function RecoverPage() {
  const [stage, setStage] = useState<Stage>("screening");
  const [platform, setPlatform] = useState<RecoveryPlatform | null>(null);
  const [actions, setActions] = useState<Set<RecoveryAction>>(new Set());
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [showContacts, setShowContacts] = useState(false);

  function toggleAction(action: RecoveryAction) {
    setActions((prev) => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action);
      else next.add(action);
      return next;
    });
  }

  function handleShowChecklist() {
    if (!platform || actions.size === 0) return;
    setChecked({});
    setShowContacts(false);
    setStage("checklist");
  }

  if (stage === "screening") {
    return (
      <div className="flex flex-col gap-8 py-6">
        <div className="animate-rise-in text-center">
          <h1 className="text-2xl font-bold">잠깐! 이거 먼저 확인할게요</h1>
          <p className="mt-3 text-base text-foreground/70">
            실제로 정보가 유출됐다고 의심되거나,
            <br />
            금전적 피해를 입으셨나요?
          </p>
        </div>

        <div
          className="animate-rise-in flex flex-col gap-3"
          style={{ animationDelay: "100ms" }}
        >
          <button
            type="button"
            onClick={() => setStage("select")}
            className="w-full rounded-xl bg-red-600 py-4 text-base font-semibold text-white transition hover:bg-red-700"
          >
            네, 어떤 방법으로든 피해를 봤습니다
          </button>
          <button
            type="button"
            onClick={() => setStage("reassurance")}
            className="w-full rounded-xl border border-foreground/15 py-4 text-base font-semibold transition hover:bg-foreground/5"
          >
            아니요
          </button>
        </div>
      </div>
    );
  }

  if (stage === "reassurance") {
    return (
      <div className="flex flex-col gap-8 py-6">
        <div className="animate-rise-in text-center">
          <h1 className="text-3xl font-extrabold">다행입니다.</h1>
          <p className="mt-2 text-base text-foreground/70">
            그래도 혹시 모르니 다음 조치는 취하는 게 좋을 것 같아요.
          </p>
        </div>

        <ul
          className="animate-rise-in flex flex-col gap-2"
          style={{ animationDelay: "100ms" }}
        >
          {LIGHT_SELF_CHECKS.map((tip, index) => (
            <li
              key={index}
              className="flex items-start gap-3 rounded-xl border border-foreground/10 px-4 py-3 text-sm"
            >
              <span>✓</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>

        <div
          className="animate-rise-in flex flex-col gap-2 pt-2"
          style={{ animationDelay: "180ms" }}
        >
          <button
            type="button"
            onClick={() => setStage("select")}
            className="text-center text-sm text-foreground/50 underline underline-offset-4"
          >
            그래도 더 자세히 확인하고 싶어요 →
          </button>
          <Link
            href="/"
            className="text-center text-sm text-foreground/40 underline underline-offset-4"
          >
            처음으로
          </Link>
        </div>
      </div>
    );
  }

  if (stage === "select") {
    return (
      <div className="flex flex-col gap-8 py-6">
        <div className="animate-rise-in text-center">
          <h1 className="text-3xl font-extrabold">괜찮아요</h1>
          <p className="mt-2 text-lg text-foreground/70">하나씩 하면 됩니다</p>
        </div>

        <div
          className="animate-rise-in rounded-xl bg-red-50 px-4 py-4 dark:bg-red-950"
          style={{ animationDelay: "80ms" }}
        >
          <p className="text-sm font-bold text-red-700 dark:text-red-300">
            지금 바로 다음 번호들 중 하나에게 도움을 요청하세요
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {REPORT_CONTACTS.map((contact) => (
              <li
                key={contact.situation}
                className="flex flex-col rounded-lg bg-white/70 px-3 py-2 dark:bg-black/20"
              >
                <span className="text-xs text-red-700/70 dark:text-red-300/70">
                  {contact.situation}
                </span>
                <span className="font-medium text-red-800 dark:text-red-200">
                  {contact.contact}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <section
          className="animate-rise-in flex flex-col gap-3"
          style={{ animationDelay: "160ms" }}
        >
          <h2 className="text-sm font-bold text-foreground/50">
            어디서 받은 링크예요?
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {PLATFORMS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setPlatform(item.value)}
                className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                  platform === item.value
                    ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "border-foreground/15"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section
          className="animate-rise-in flex flex-col gap-3"
          style={{ animationDelay: "220ms" }}
        >
          <h2 className="text-sm font-bold text-foreground/50">
            무엇을 했어요? (여러 개 선택 가능)
          </h2>
          <div className="flex flex-col gap-2">
            {ACTIONS.map((item) => (
              <label
                key={item.value}
                className="flex items-center gap-3 rounded-xl border border-foreground/15 px-4 py-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={actions.has(item.value)}
                  onChange={() => toggleAction(item.value)}
                  className="h-4 w-4"
                />
                {item.label}
              </label>
            ))}
          </div>
        </section>

        <button
          type="button"
          disabled={!platform || actions.size === 0}
          onClick={handleShowChecklist}
          className="animate-rise-in w-full rounded-xl bg-blue-600 py-3 text-base font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
          style={{ animationDelay: "280ms" }}
        >
          대처법 보기
        </button>

        <p
          className="animate-rise-in text-center text-xs text-foreground/40"
          style={{ animationDelay: "320ms" }}
        >
          {COMMON_INTRO[0]}
        </p>
      </div>
    );
  }

  if (!platform) return null;

  const checklist = getRecoveryChecklist(platform, Array.from(actions));

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="animate-rise-in">
        <h1 className="text-3xl font-extrabold">지금 이 순서대로 하세요</h1>
        <p className="mt-1 text-sm text-foreground/60">{COMMON_INTRO[0]}</p>
      </div>

      {checklist.urgent && (
        <p className="animate-rise-in whitespace-pre-line rounded-xl bg-red-50 px-4 py-3 text-sm font-medium leading-relaxed text-red-700 dark:bg-red-950 dark:text-red-300">
          {URGENT_NOTICE}
        </p>
      )}

      {checklist.notes.map((note, index) => (
        <p
          key={index}
          className="animate-rise-in rounded-xl bg-yellow-50 px-4 py-3 text-sm font-medium text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"
        >
          ⚠️ {note}
        </p>
      ))}

      <ol
        className="animate-rise-in flex flex-col gap-2"
        style={{ animationDelay: "80ms" }}
      >
        {checklist.items.map((item, index) => (
          <li key={index}>
            <label className="flex items-start gap-3 rounded-xl border border-foreground/10 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={Boolean(checked[index])}
                onChange={() =>
                  setChecked((prev) => ({ ...prev, [index]: !prev[index] }))
                }
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span
                className={
                  checked[index] ? "text-foreground/40 line-through" : ""
                }
              >
                {index + 1}. {item}
              </span>
            </label>
          </li>
        ))}
      </ol>

      <div
        className="animate-rise-in border-t border-foreground/10 pt-4"
        style={{ animationDelay: "160ms" }}
      >
        <button
          type="button"
          onClick={() => setShowContacts((prev) => !prev)}
          className="w-full rounded-xl border border-foreground/15 py-3 text-sm font-semibold"
        >
          {showContacts
            ? "신고·상담 창구 닫기"
            : "혼자 해결하기 어려우면 신고·상담 창구 보기 →"}
        </button>

        {showContacts && (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {REPORT_CONTACTS.map((contact) => (
              <li
                key={contact.situation}
                className="flex flex-col rounded-lg bg-foreground/5 px-3 py-2"
              >
                <span className="text-xs text-foreground/50">
                  {contact.situation}
                </span>
                <span className="font-medium">{contact.contact}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => setStage("select")}
        className="animate-rise-in text-center text-sm text-foreground/50 underline underline-offset-4"
        style={{ animationDelay: "220ms" }}
      >
        다시 선택하기
      </button>

      <Link
        href="/"
        className="animate-rise-in text-center text-sm text-foreground/40 underline underline-offset-4"
        style={{ animationDelay: "220ms" }}
      >
        처음으로
      </Link>
    </div>
  );
}
