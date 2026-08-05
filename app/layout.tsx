import type { Metadata } from "next";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return {
    metadataBase: new URL("https://app.waniskaservices.ca"),
    title: "Waniskâ Watch — Territory Watch",
    description:
      "Know what’s happening on the land. Explore current public mining claims, projects and operations alongside carefully sourced territorial context.",
    icons: {
      icon: [{ url: `${basePath}/waniska-watch-icon.png`, type: "image/png" }],
      shortcut: `${basePath}/waniska-watch-icon.png`,
      apple: `${basePath}/waniska-watch-icon.png`,
    },
    openGraph: {
      title: "Waniskâ Watch — Territory Watch",
      description: "Know what’s happening on the land.",
      url: "https://app.waniskaservices.ca/watch/",
      siteName: "Waniskâ Watch",
      type: "website",
      images: [{
        url: "https://app.waniskaservices.ca/watch/og-territory-watch-v2.png",
        width: 1200,
        height: 630,
        alt: "Waniskâ Watch — Know what’s happening on the land.",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Waniskâ Watch — Territory Watch",
      description: "Know what’s happening on the land.",
      images: ["https://app.waniskaservices.ca/watch/og-territory-watch-v2.png"],
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
      <body>{children}</body>
    </html>
  );
}
