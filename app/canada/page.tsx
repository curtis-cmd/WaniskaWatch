import type { Metadata } from "next";
import NationalOverview from "./NationalOverview";
import overview from "../../public/data/canada-claims-overview.json";

export const metadata: Metadata = {
  title: "Canada-wide mining claims | Waniskâ Watch",
  description: "Explore published mining-claim snapshots across Canada. Aggregated locations, source dates and coverage limitations remain visible.",
  alternates: { canonical: "https://app.waniskaservices.ca/watch/canada" },
};

export default function CanadaPage() {
  return <NationalOverview data={overview} />;
}
