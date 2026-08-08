import { NextResponse } from "next/server";
import statusDirectory from "../../../public/data/jurisdiction-status.json";

type JurisdictionKey = keyof typeof statusDirectory.jurisdictions;

export function unavailableJurisdictionResponse(jurisdiction: JurisdictionKey) {
  const status = statusDirectory.jurisdictions[jurisdiction];
  if (status?.state === "verified") return null;
  return NextResponse.json(
    {
      error: "This jurisdiction is temporarily unpublished because its government source could not be verified during the latest refresh.",
      lastVerified: status?.lastVerified || null,
    },
    { status: 503 },
  );
}
