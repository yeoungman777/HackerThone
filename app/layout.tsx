import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Settings from "@/components/Settings";

// 다크모드가 저장돼 있으면 그걸, 없으면 OS 설정을 따라 <html>에 .dark를 붙인다.
// React가 하이드레이션되기 전에 실행돼야 화면이 잠깐 밝았다가 어두워지는 깜빡임이 없다.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("checklink:theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CheckLink",
  description: "받은 링크, 누르기 전에 여기서 먼저 확인하세요",
  appleWebApp: {
    capable: true,
    title: "CheckLink",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icon.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Settings />
        <div className="mx-auto min-h-screen max-w-[480px] px-5 py-8 sm:max-w-[640px] sm:px-8 md:max-w-[720px] md:py-12">
          {children}
        </div>
      </body>
    </html>
  );
}
