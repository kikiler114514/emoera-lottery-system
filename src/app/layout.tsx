import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Providers } from "./providers";
import { Navbar } from "@/components/Navbar";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "抽奖系统",
  description: "一个现代化的抽奖系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const baiduAnalyticsId = process.env.NEXT_PUBLIC_BAIDU_ANALYTICS_ID;

  return (
    <html lang="zh" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        {baiduAnalyticsId && (
          <Script
            strategy="afterInteractive"
            id="baidu-analytics"
          >
            {`
              var _hmt = _hmt || [];
              (function() {
                var hm = document.createElement("script");
                hm.src = "https://hm.baidu.com/hm.js?${baiduAnalyticsId}";
                var s = document.getElementsByTagName("script")[0]; 
                s.parentNode.insertBefore(hm, s);
              })();
            `}
          </Script>
        )}
      </head>
      <body>
        <AntdRegistry>
          <Providers>
            <Navbar />
            {children}
          </Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
