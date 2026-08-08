import { NextRequest, NextResponse } from "next/server";
import type { Geometry } from "geojson";
import { unavailableJurisdictionResponse } from "../sourceVerification";

const SERVICE = "https://openmaps.gov.bc.ca/geo/pub/WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW/ows";
const TYPE_NAME = "pub:WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW";
const MAX_SOURCE_ROWS = 2000;

function validNumber(value: string | null) {
  if (value == null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

type SourceFeature = {
  type: "Feature";
  id?: string | number;
  geometry: Geometry;
  properties?: Record<string, string | number | null>;
};

export async function GET(request: NextRequest) {
  const unavailable = unavailableJurisdictionResponse("british-columbia");
  if (unavailable) return unavailable;
  const west = validNumber(request.nextUrl.searchParams.get("west"));
  const south = validNumber(request.nextUrl.searchParams.get("south"));
  const east = validNumber(request.nextUrl.searchParams.get("east"));
  const north = validNumber(request.nextUrl.searchParams.get("north"));
  const zoom = validNumber(request.nextUrl.searchParams.get("zoom")) ?? 0;
  if ([west, south, east, north].some(value => value == null)) {
    return NextResponse.json({ error: "A valid map bounding box is required." }, { status: 400 });
  }
  if (zoom < 8) {
    return NextResponse.json({
      type: "FeatureCollection",
      features: [],
      metadata: { requiresZoom: true, count: 0, truncated: false },
    });
  }

  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: TYPE_NAME,
    bbox: `${west},${south},${east},${north},EPSG:4326`,
    count: String(MAX_SOURCE_ROWS),
    sortBy: "TENURE_NUMBER_ID,CLIENT_NUMBER_ID",
    outputFormat: "application/json",
    srsName: "EPSG:4326",
  });

  try {
    const response = await fetch(`${SERVICE}?${params}`, { next: { revalidate: 900 } });
    if (!response.ok) throw new Error("BC tenure service unavailable");
    const payload = await response.json();
    const today = new Date().toISOString().slice(0, 10);
    const groups = new Map<string, {
      geometry: Geometry;
      properties: Record<string, string | number | null>;
      owners: Map<string, { name: string; percent: number | null }>;
    }>();

    (payload.features || []).forEach((feature: SourceFeature) => {
      const properties = feature.properties || {};
      const tenure = String(properties.TENURE_NUMBER_ID || "");
      const subtype = String(properties.TENURE_SUB_TYPE_CODE || "").toUpperCase();
      const expiry = String(properties.GOOD_TO_DATE || "").slice(0, 10);
      if (!tenure || subtype !== "C" || properties.TERMINATION_DATE || (expiry && expiry < today)) return;
      let group = groups.get(tenure);
      if (!group) {
        group = { geometry: feature.geometry, properties, owners: new Map() };
        groups.set(tenure, group);
      }
      const ownerName = String(properties.OWNER_NAME || "").trim();
      if (ownerName) {
        group.owners.set(String(properties.CLIENT_NUMBER_ID || ownerName), {
          name: ownerName,
          percent: properties.PERCENT_OWNERSHIP == null
            ? null
            : Number(properties.PERCENT_OWNERSHIP),
        });
      }
    });

    const features = [...groups.entries()].map(([tenure, group]) => ({
      type: "Feature",
      id: `british-columbia:claim:${tenure}`,
      geometry: group.geometry,
      properties: {
        OBJECTID: tenure,
        TENURE_NUMBER_ID: tenure,
        CLAIM_NAME: group.properties.CLAIM_NAME,
        STATUS: "Active",
        OWNERS: [...group.owners.values()].map(owner => (
          owner.percent == null ? owner.name : `${owner.name}: ${owner.percent}%`
        )).join("; ") || null,
        ISSUE_DATE: group.properties.ISSUE_DATE,
        GOOD_TO_DATE: group.properties.GOOD_TO_DATE,
        AREA_IN_HECTARES: group.properties.AREA_IN_HECTARES,
        TITLE_TYPE: group.properties.TITLE_TYPE_DESCRIPTION || "Mining claim",
      },
    }));
    const matched = Number(payload.numberMatched || payload.totalFeatures || features.length);
    const returned = Number(payload.numberReturned || payload.features?.length || features.length);
    return NextResponse.json({
      type: "FeatureCollection",
      features,
      metadata: {
        count: features.length,
        truncated: Number.isFinite(matched) && matched > returned,
        requiresZoom: false,
        source: "Government of British Columbia Mineral Titles Online — Active Claims",
        sourceUrl: SERVICE,
      },
    });
  } catch {
    return NextResponse.json({ error: "The BC Mineral Titles service is temporarily unavailable." }, { status: 502 });
  }
}
