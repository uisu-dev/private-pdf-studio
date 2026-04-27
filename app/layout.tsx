import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Private PDF Studio",
  description: "Browser-only image to PDF, PDF split, and PDF merge tools."
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
