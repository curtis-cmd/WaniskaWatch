import type { Metadata } from "next";
import NationalOverview from "./NationalOverview";
import overview from "../../public/data/canada-claims-overview.json";
import {freshVerification} from '../publication-freshness.mjs';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Canada-wide mining map | Waniskâ Watch",
  description: "Explore public mining claims, leases, exploration and operating mines across Canada. Zoom for available record boundaries, sources and verification dates.",
  alternates: { canonical: "https://app.waniskaservices.ca/watch/canada" },
};

export default function CanadaPage() {
  const jurisdictions = overview.jurisdictions.filter(j => freshVerification(j.verifiedAt));
  const included = new Set(jurisdictions.map(j => j.key));
  const dates = jurisdictions.map(j => j.verifiedAt).sort();
  const data = {...overview, jurisdictions,
    features: overview.features.filter(f => included.has(f.properties.province)),
    unavailable: [...overview.unavailable, ...overview.jurisdictions.filter(j => !included.has(j.key)).map(j => ({name: j.name, reason: 'Temporarily withheld pending fresh source verification'}))],
    metadata: {...overview.metadata, claimCount: jurisdictions.reduce((n, j) => n + j.count, 0), oldestVerified: dates[0] || null, newestVerified: dates.at(-1) || null}};
  return <NationalOverview data={data} />;
}
