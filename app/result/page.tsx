"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ScanProgress from "@/components/ScanProgress";
import VerdictBadge from "@/components/VerdictBadge";
import BlurredScreenshot from "@/components/BlurredScreenshot";
import EvidenceList from "@/components/EvidenceList";
import Reveal from "@/components/Reveal";
import { NORMALIZE_ERROR_MESSAGES, type NormalizeReason } from "@/lib/normalize";
import type { ScanResult } from "@/lib/types";

type Status = "no-url" | "loading" | "done" | "error";

// 서버 쪽 최대 처리 시간(120초)보다 넉넉하게 클라이언트 타임아웃을 잡는다.
const FETCH_TIMEOUT_MS = 130_000;
const SECOND_STEP_DELAY_MS = 2500;

function isNormalizeReason(value: unknown): value is NormalizeReason {
  return typeof value === "string" && value in NORMALIZE_ERROR_MESSAGES;
}

export default function ResultPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(5);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("지금은 검사할 수 없어요");
  const [scannedUrl, setScannedUrl] = useState<string | null>(null);

  // 화면을 벗어났거나 재시도로 새 요청이 시작된 뒤 이전 요청의 응답이 상태를 덮어쓰지 않도록 막는다.
  const runIdRef = useRef(0);

  useEffect(() => {
    const url = sessionStorage.getItem("clicksafe:url");
    if (!url) {
      setStatus("no-url");
      return;
    }
    setScannedUrl(url);
    startScan(url);
  }, []);

  function startScan(url: string) {
    const id = ++runIdRef.current;
    setStatus("loading");
    setStep(0);
    setProgress(5);
    setResult(null);

    const stepTimer1 = setTimeout(() => {
      if (runIdRef.current === id) setStep(1);
    }, 400);
    const stepTimer2 = setTimeout(() => {
      if (runIdRef.current === id) setStep(2);
    }, SECOND_STEP_DELAY_MS);

    // 실제 진행률은 알 수 없으니 90%까지만 서서히 채우고, 응답이 오면 100%로 마무리한다.
    const progressTimer = setInterval(() => {
      if (runIdRef.current !== id) return;
      setProgress((prev) => (prev >= 90 ? 90 : prev + 3));
    }, 800);

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (runIdRef.current !== id) return;

        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          const reason =
            body && typeof body === "object" && "error" in body
              ? (body as { error: unknown }).error
              : undefined;
          setErrorMessage(
            isNormalizeReason(reason)
              ? NORMALIZE_ERROR_MESSAGES[reason]
              : "지금은 검사할 수 없어요"
          );
          setStatus("error");
          return;
        }

        const data = (await response.json()) as ScanResult;
        setStep(3);
        setProgress(100);
        window.setTimeout(() => {
          if (runIdRef.current !== id) return;
          setResult(data);
          setStatus("done");
        }, 400);
      })
      .catch(() => {
        if (runIdRef.current !== id) return;
        setErrorMessage("지금은 검사할 수 없어요");
        setStatus("error");
      })
      .finally(() => {
        clearTimeout(stepTimer1);
        clearTimeout(stepTimer2);
        clearInterval(progressTimer);
        clearTimeout(abortTimer);
      });
  }

  function handleRetry() {
    if (scannedUrl) startScan(scannedUrl);
  }

  if (status === "no-url") {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-foreground/70">검사할 링크를 찾을 수 없어요</p>
        <Link
          href="/"
          className="text-sm font-semibold text-blue-600 underline underline-offset-4"
        >
          처음으로 돌아가기
        </Link>
      </div>
    );
  }

  if (status === "loading") {
    return <ScanProgress currentStep={step} progress={progress} />;
  }

  if (status === "error") {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-foreground/70">{errorMessage}</p>
        <button
          type="button"
          onClick={handleRetry}
          className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white"
        >
          다시 시도하기
        </button>
        <Link
          href="/"
          className="text-sm text-foreground/50 underline underline-offset-4"
        >
          다른 링크 검사하기
        </Link>
      </div>
    );
  }

  if (!result) return null;

  const { score, explanation, facts, legalNotice, partial } = result;
  // "이미 눌렀어요" 대처 안내는 실제로 위험하거나(danger) 법적 제한 대상(content_restricted)일 때만
  // 보여준다 — 안전하거나 단순 주의 수준에서는 대처할 사고 자체가 없다.
  const showRecoveryCta = score.verdict === "danger" || score.verdict === "content_restricted";
  const screenshotUrl = facts.urlscan?.screenshot_url ?? facts.fallback_screenshot_url;

  return (
    <div className="flex flex-col gap-8 py-6">
      <VerdictBadge verdict={score.verdict} />

      {legalNotice && (
        <p className="animate-rise-in rounded-xl bg-orange-50 px-4 py-3 text-center text-sm leading-relaxed text-orange-800 dark:bg-orange-950 dark:text-orange-200">
          {legalNotice}
        </p>
      )}

      <p className="animate-rise-in text-center text-lg font-bold">{explanation.summary}</p>

      {partial && (
        <p className="rounded-lg bg-foreground/5 px-3 py-2 text-center text-xs text-foreground/60">
          일부 검사만 완료됐어요. 결과가 정확하지 않을 수 있어요.
        </p>
      )}

      <Reveal className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-foreground/50">
          무슨 사이트냐면...
        </h2>
        <p className="text-sm leading-relaxed">{explanation.story}</p>
      </Reveal>

      {screenshotUrl && (
        <Reveal className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-foreground/50">
            이 페이지의 실제 모습
          </h2>
          <BlurredScreenshot src={screenshotUrl} />
        </Reveal>
      )}

      <Reveal className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-foreground/50">
          이렇게 판단했어요
        </h2>
        <EvidenceList items={explanation.evidence} />
      </Reveal>

      <Reveal className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-foreground/50">
          TIP을 알려드릴까요?
        </h2>
        <ul className="space-y-2 text-sm">
          {explanation.tips.map((tip, index) => (
            <li key={index} className="flex items-start gap-2">
              <span>•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal className="flex flex-col gap-2 pt-2">
        {showRecoveryCta && (
          <Link
            href="/recover"
            className="w-full rounded-xl bg-blue-600 py-3 text-center text-base font-semibold text-white"
          >
            이미 눌렀어요 →
          </Link>
        )}
        <Link
          href="/"
          className="w-full py-2 text-center text-sm text-foreground/50 underline underline-offset-4"
        >
          다른 링크 검사하기
        </Link>
      </Reveal>
    </div>
  );
}
