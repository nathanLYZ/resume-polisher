import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "简历润色助手 - 根据JD智能优化简历",
  description: "粘贴简历和目标职位描述，AI自动帮你润色简历，匹配JD关键词，提升面试通过率。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
