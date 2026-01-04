import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "IG Reel Transcript Manager",
  description: "Instagram reel transcript management app",
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
          <main className="ml-44 min-h-screen">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
