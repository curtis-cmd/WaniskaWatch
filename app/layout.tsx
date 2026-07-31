import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Waniskâ Watch — Territory Watch",
    description:
      "A free community resource for exploring public mining activity alongside carefully sourced territorial context.",
    openGraph: {
      title: "Waniskâ Watch — Territory Watch",
      description: "Public mining intelligence for informed community decisions.",
    },
    twitter: {
      card: "summary",
      title: "Waniskâ Watch — Territory Watch",
      description: "Public mining intelligence for informed community decisions.",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
