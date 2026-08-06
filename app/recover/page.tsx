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
  { value: "other", label: "기타" },
];

const ACTIONS: { value: RecoveryAction; label: string }[] = [
  { value: "clicked", label: "링크만 눌렀어요" },
  { value: "credentials", label: "아이디·비밀번호를 입력했어요" },
  { value: "app", label: "앱을 설치했어요" },
  { value: "photo", label: "사진을 보냈어요" },
  { value: "money", label: "돈을 보냈어요" },
];

export default function RecoverPage() {
  const [platform, setPlatform] = useState<RecoveryPlatform | null>(null);
  const [actions, setActions] = useState<Set<RecoveryAction>>(new Set());
  const [showChecklist, setShowChecklist] = useState(false);
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
    setShowChecklist(true);
  }

  if (!showChecklist || !platform) {
    return (
      <div className="flex flex-col gap-8 py-6">
        <div className="text-center">
          <h1 className="text-xl font-bold">괜찮아요.</h1>
          <p className="mt-1 text-foreground/70">지금부터 하나씩 하면 돼요</p>
        </div>

        <section className="flex flex-col gap-3">
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

        <section className="flex flex-col gap-3">
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
          className="w-full rounded-xl bg-blue-600 py-3 text-base font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          대처법 보기
        </button>

        <p className="text-center text-xs text-foreground/40">
          {COMMON_INTRO[0]}
        </p>
      </div>
    );
  }

  const checklist = getRecoveryChecklist(platform, Array.from(actions));

  return (
    <div className="flex flex-col gap-6 py-6">
      <div>
        <h1 className="text-xl font-bold">지금 이 순서대로 하세요</h1>
        <p className="mt-1 text-sm text-foreground/60">{COMMON_INTRO[0]}</p>
      </div>

      {checklist.urgent && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          {URGENT_NOTICE}
        </p>
      )}

      {checklist.notes.map((note, index) => (
        <p
          key={index}
          className="rounded-xl bg-yellow-50 px-4 py-3 text-sm font-medium text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"
        >
          ⚠️ {note}
        </p>
      ))}

      <ol className="flex flex-col gap-2">
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

      <div className="border-t border-foreground/10 pt-4">
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
        onClick={() => setShowChecklist(false)}
        className="text-center text-sm text-foreground/50 underline underline-offset-4"
      >
        다시 선택하기
      </button>

      <Link
        href="/"
        className="text-center text-sm text-foreground/40 underline underline-offset-4"
      >
        처음으로
      </Link>
    </div>
  );
}
