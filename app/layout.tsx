import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Private PDF Studio",
  description: "브라우저에서만 동작하는 PDF 도구. 이미지 변환, 분할, 병합, 압축, 페이지 순서, 서명·도장."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
