import type { Metadata } from "next";
import { headers } from "next/headers";
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
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "https://waniska-minerals-watch.invalid";

  return {
    title: "Waniskâ Minerals Watch — Treaty Territory Mining Intelligence",
    description:
      "Community-first intelligence on Manitoba mining claims, exploration licences, mineral leases, mine sites, and recorded holders.",
    openGraph: {
      title: "Waniskâ Minerals Watch",
      description: "Mining intelligence by treaty territory.",
      images: [{
        url: `${origin}/og.png`,
        width: 1200,
        height: 630,
        alt: "Waniskâ Minerals Watch — Mining intelligence by treaty territory",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Waniskâ Minerals Watch",
      description: "Mining intelligence by treaty territory.",
      images: [`${origin}/og.png`],
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
