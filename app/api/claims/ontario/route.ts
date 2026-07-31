import { NextRequest, NextResponse } from "next/server";

const CLAIM_LAYER =
  "https://ws.lioservices.lrc.gov.on.ca/arcgis1071a/rest/services/MLAS/mlas_op/MapServer/1";
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
  if (zoom < 9) {
    return NextResponse.json({
      type: "FeatureCollection",
      features: [],
      metadata: { requiresZoom: true, count: 394878, truncated: false },
    });
  }

  const geometry = JSON.stringify({
    xmin: west,
    ymin: south,
    xmax: east,
    ymax: north,
    spatialReference: { wkid: 4326 },
  });
  const shared = new URLSearchParams({
    where: "1=1",
    geometry,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    f: "json",
  });
  const countResponse = await fetch(`${CLAIM_LAYER}/query?${shared}&returnCountOnly=true`, {
    next: { revalidate: 900 },
  });
  if (!countResponse.ok) {
    return NextResponse.json({ error: "Ontario MLAS is temporarily unavailable." }, { status: 502 });
  }
  const countPayload = await countResponse.json();
  const count = Number(countPayload.count || 0);

  const featureParams = new URLSearchParams(shared);
  featureParams.set("outFields", [
    "OBJECTID",
    "TENURE_NUMBER_ID",
    "TENURE_STATUS_DESC",
    "ISSUE_DATE",
    "CLAIM_DUE_DATE",
    "HOLDER",
  ].join(","));
  featureParams.set("returnGeometry", "true");
  featureParams.set("outSR", "4326");
  featureParams.set("resultRecordCount", String(MAX_FEATURES));
  featureParams.set("f", "geojson");
  const featureResponse = await fetch(`${CLAIM_LAYER}/query?${featureParams}`, {
    next: { revalidate: 900 },
  });
  if (!featureResponse.ok) {
    return NextResponse.json({ error: "Ontario MLAS is temporarily unavailable." }, { status: 502 });
  }
  const payload = await featureResponse.json();
  return NextResponse.json({
    ...payload,
    metadata: {
      count,
      truncated: count > MAX_FEATURES,
      requiresZoom: false,
      source: "Government of Ontario MLAS — Mining Claims",
      sourceUrl: CLAIM_LAYER,
    },
  });
}
