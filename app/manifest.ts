import type { MetadataRoute } from "next";

// 아이폰 Safari에서 "홈 화면에 추가"로 앱처럼 설치할 수 있게 하는 설정.
// 이게 없어도 "홈 화면에 추가" 자체는 되지만, 아이콘·앱 이름·전체화면 실행이 안 된다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CheckLink",
    short_name: "CheckLink",
    description: "받은 링크, 누르기 전에 여기서 먼저 확인하세요",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9f6",
    theme_color: "#3452eb",
    icons: [
      { src: "/icon.jpg", sizes: "1024x1024", type: "image/jpeg" },
    ],
  };
}
