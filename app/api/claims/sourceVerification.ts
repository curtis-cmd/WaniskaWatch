import { NextResponse } from "next/server";
import statusDirectory from "../../../public/data/jurisdiction-status.json";
import { isCurrentActivity } from "../../current-record.mjs";

type JurisdictionKey = keyof typeof statusDirectory.jurisdictions;

export function unavailableJurisdictionResponse(jurisdiction: JurisdictionKey) {
  const status = statusDirectory.jurisdictions[jurisdiction];
  const age = Date.now() - Date.parse(status?.lastVerified || '');
  if (status?.state === "verified" && age >= 0 && age <= 48 * 3600000) return null;
  return NextResponse.json(
    {
      error: "This jurisdiction is temporarily unpublished because its government source could not be verified during the latest refresh.",
      lastVerified: status?.lastVerified || null,
    },
    { status: 503 },
  );
}

export function eligibleSourceFeatures(features: any[]) {
  if (!Array.isArray(features)) throw new Error('Invalid government feature response');
  return features.filter(feature => {
    const p = feature.properties || {};
    const raw = p.CLAIM_DUE_DATE ?? p.EXPIRY_DATE ?? p.GOOD_TO_DATE ?? p.CANCEL_DT;
    const expiryDate = typeof raw === 'number' ? new Date(raw).toISOString().slice(0, 10) : raw;
    return isCurrentActivity({kind: 'claim', status: p.TENURE_STATUS_DESC || p.TENURE_STATUS || p.CLAIM_STAT || p.STATUS, expiryDate});
  });
}
