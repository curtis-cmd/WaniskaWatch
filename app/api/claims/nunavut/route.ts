import { NextRequest, NextResponse } from "next/server";

const CLAIM_LAYER = "https://geo.sac-isc.gc.ca/geomatics/rest/services/Donnees_Ouvertes-Open_Data/Claim_minier_NU_Mineral_Claim/MapServer/0";
const MAX_FEATURES = 2000;

function validNumber(value: string | null) {
  if (value == null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET(request: NextRequest) {
  const west = validNumber(request.nextUrl.searchParams.get("west"));
  const south = validNumber(request.nextUrl.searchParams.get("south"));
  const east = validNumber(request.nextUrl.searchParams.get("east"));
  const north = validNumber(request.nextUrl.searchParams.get("north"));
  const zoom = validNumber(request.nextUrl.searchParams.get("zoom")) ?? 0;
  if ([west, south, east, north].some(value => value == null)) {
    return NextResponse.json({ error: "A valid map bounding box is required." }, { status: 400 });
  }
  if (zoom < 7) {
    return NextResponse.json({ type: "FeatureCollection", features: [], metadata: { requiresZoom: true, count: 0, truncated: false } });
  }
  const geometry = JSON.stringify({
    xmin: west, ymin: south, xmax: east, ymax: north,
    spatialReference: { wkid: 4326 },
  });
  const shared = new URLSearchParams({
    where: "CLAIM_STAT IN ('ACTIVE','REINSTATED','SUSPENDED')",
    geometry,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    f: "json",
  });
  try {
    const countResponse = await fetch(`${CLAIM_LAYER}/query?${shared}&returnCountOnly=true`, { next: { revalidate: 900 } });
    if (!countResponse.ok) throw new Error("count unavailable");
    const countPayload = await countResponse.json();
    const featureParams = new URLSearchParams(shared);
    featureParams.set("outFields", "OBJECTID,CLAIM_NUM,CLAIM_NAME,CLAIM_STAT,OWNERS,ISSUE_DATE,CANCEL_DT,DISTRICT,AREA_HA");
    featureParams.set("returnGeometry", "true");
    featureParams.set("outSR", "4326");
    featureParams.set("resultRecordCount", String(MAX_FEATURES));
    featureParams.set("f", "geojson");
    const featureResponse = await fetch(`${CLAIM_LAYER}/query?${featureParams}`, { next: { revalidate: 900 } });
    if (!featureResponse.ok) throw new Error("features unavailable");
    const payload = await featureResponse.json();
    const count = Number(countPayload.count || 0);
    return NextResponse.json({
      ...payload,
      metadata: {
        count,
        truncated: count > MAX_FEATURES,
        requiresZoom: false,
        source: "CIRNAC — Nunavut Mineral Claims",
        sourceUrl: CLAIM_LAYER,
      },
    });
  } catch {
    return NextResponse.json({ error: "The Nunavut mineral claims service is temporarily unavailable." }, { status: 502 });
  }
}
