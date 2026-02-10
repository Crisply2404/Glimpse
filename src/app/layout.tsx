import "./globals.css";

import type { ReactNode } from "react";

export const metadata = {
  title: "Glimpse Demo",
  description: "用模糊印象找回游戏，并可视化筛选过程（候选池筛选 + 扭蛋掉落）",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A//www.w3.org/2000/svg'%20viewBox%3D'0%200%2064%2064'%3E%3Crect%20width%3D'64'%20height%3D'64'%20rx%3D'12'%20fill%3D'%23111827'/%3E%3Ctext%20x%3D'32'%20y%3D'40'%20font-size%3D'28'%20text-anchor%3D'middle'%20fill%3D'%23fff'%20font-family%3D'Arial%2C%20sans-serif'%3EG%3C/text%3E%3C/svg%3E"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
