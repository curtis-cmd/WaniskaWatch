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
    title: "Waniskâ Watch — Treaty Territory Environmental Intelligence",
    description:
      "Community-first intelligence on public projects and environmental activity across Manitoba treaty territories.",
    openGraph: {
      title: "Waniskâ Watch",
      description: "Environmental and industrial intelligence by treaty territory.",
    },
    twitter: {
      card: "summary",
      title: "Waniskâ Watch",
      description: "Environmental and industrial intelligence by treaty territory.",
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
