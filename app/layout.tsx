import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "DOOMSCROLLER - IG Reel台本マネージャー",
    template: "%s | DOOMSCROLLER",
  },
  description: "Instagram Reelsの台本を管理・分析・セマンティック検索できるツール",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "DOOMSCROLLER",
    description: "Instagram Reelsの台本を管理・分析・セマンティック検索できるツール",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#334155",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="bg-gray-50/50">
        <Providers>
          <Sidebar />
          <main className="min-h-screen md:ml-44">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
