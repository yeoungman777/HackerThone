"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { normalizeUrl, NORMALIZE_ERROR_MESSAGES } from "@/lib/normalize";

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const normalized = normalizeUrl(url);
    if (!normalized.ok) {
      setError(NORMALIZE_ERROR_MESSAGES[normalized.reason]);
      return;
    }

    setError(null);
    // 검사 결과는 저장하지 않는다 — 세션 동안만 브라우저에 유지했다가 결과 화면에서 바로 지운다.
    sessionStorage.setItem("clicksafe:url", normalized.url);
    router.push("/result");
  }

  return (
    <div className="flex min-h-[80vh] flex-col justify-center gap-10">
      <div className="text-center">
        <h1 className="text-3xl font-bold">눌러도돼?</h1>
        <p className="mt-3 text-foreground/70">
          받은 링크, 누르기 전에
          <br />
          여기서 먼저 확인하세요
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          autoFocus
          type="text"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://..."
          className="w-full rounded-xl border border-foreground/15 bg-transparent px-4 py-3 text-base outline-none focus:border-blue-500"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="w-full rounded-xl bg-blue-600 py-3 text-base font-semibold text-white transition hover:bg-blue-700"
        >
          검사하기
        </button>
      </form>

      <div className="border-t border-foreground/10 pt-6 text-center">
        <Link
          href="/recover"
          className="text-sm font-medium text-foreground/70 underline underline-offset-4"
        >
          이미 링크를 눌렀어요 →
        </Link>
      </div>

      <p className="text-center text-xs text-foreground/40">
        검사 결과는 저장되지 않아요
      </p>
    </div>
  );
}
