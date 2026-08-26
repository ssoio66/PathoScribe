import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PathoScribe | 폐암 병리 전사·검수 지원 시제품",
  description: "보건의료정보관리사의 폐암 병리 전사 업무에서 원문과 구조화 결과를 비교해 누락·불일치를 검수하는 교육용 시제품",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
