import type { Metadata } from "next";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL("https://app.waniskaservices.ca"),
    title: "Waniskâ Watch — Territory Watch",
    description:
      "See the activity. Know the territory. Explore verified public mining records alongside carefully sourced territorial context.",
    openGraph: {
      title: "Waniskâ Watch — Territory Watch",
      description: "See the activity. Know the territory.",
      url: "https://app.waniskaservices.ca/watch/",
      siteName: "Waniskâ Watch",
      type: "website",
      images: [{
        url: "https://app.waniskaservices.ca/watch/og.png",
        width: 1200,
        height: 630,
        alt: "Waniskâ Watch — See the activity. Know the territory.",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Waniskâ Watch — Territory Watch",
      description: "See the activity. Know the territory.",
      images: ["https://app.waniskaservices.ca/watch/og.png"],
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
