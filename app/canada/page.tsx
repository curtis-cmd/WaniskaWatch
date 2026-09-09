import type { Metadata } from "next";
import NationalOverview from "./NationalOverview";
import overview from "../../public/data/canada-claims-overview.json";

export const metadata: Metadata = {
  title: "Canada-wide mining map | Waniskâ Watch",
  description: "Explore public mining claims, leases, exploration and operating mines across Canada. Zoom for available record boundaries, sources and verification dates.",
  alternates: { canonical: "https://app.waniskaservices.ca/watch/canada" },
};

export default function CanadaPage() {
  return <NationalOverview data={overview} />;
}
