"use client";

import { useState } from "react";

export default function BlurredScreenshot({ src }: { src: string | null }) {
  const [revealed, setRevealed] = useState(false);

  if (!src) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-foreground/10">
      {/* urlscan.io가 캡처한 스크린샷 — 도메인을 미리 알 수 없어 next/image 대신 일반 img를 쓴다 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="검사한 페이지의 실제 모습"
        className={`w-full transition-[filter] duration-300 ${
          revealed ? "" : "blur-2xl scale-105"
        }`}
      />
      {!revealed && (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="absolute inset-0 flex items-center justify-center bg-black/25"
        >
          <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow">
            눌러서 보기
          </span>
        </button>
      )}
    </div>
  );
}
