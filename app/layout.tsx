import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "量化助手 · 策略实验室",
  description: "A股量化策略研究助手的桌面端第一版",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
