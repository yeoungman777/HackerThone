"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** 자식 요소가 스크롤로 화면에 들어오는 순간 애니메이션을 트리거한다. 한 번 나타나면 다시 숨기지 않는다. */
export default function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${visible ? "animate-rise-in" : "opacity-0"} ${className}`}>
      {children}
    </div>
  );
}
