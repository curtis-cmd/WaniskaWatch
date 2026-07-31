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
    title: "Waniskâ Watch — Treaty Territory Mining Intelligence",
    description:
      "Community-first intelligence on Manitoba mining claims, exploration licences, mineral leases, mine sites, and recorded holders.",
    openGraph: {
      title: "Waniskâ Watch",
      description: "Mining intelligence by treaty territory.",
    },
    twitter: {
      card: "summary",
      title: "Waniskâ Watch",
      description: "Mining intelligence by treaty territory.",
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
