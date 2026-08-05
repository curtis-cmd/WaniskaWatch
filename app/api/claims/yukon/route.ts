import { NextRequest, NextResponse } from "next/server";

const CLAIM_LAYERS = [
  { id: 11, label: "Placer claim" },
  { id: 36, label: "Quartz claim" },
];
const SERVICE = "https://mapservices.gov.yk.ca/arcgis/rest/services/GeoYukon/GY_Mining/MapServer";
const MAX_FEATURES_PER_LAYER = 1000;

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
  if (zoom < 8) {
    return NextResponse.json({
      type: "FeatureCollection",
      features: [],
      metadata: { requiresZoom: true, count: 0, truncated: false },
    });
  }

  const geometry = JSON.stringify({
    xmin: west,
    ymin: south,
    xmax: east,
    ymax: north,
    spatialReference: { wkid: 4326 },
  });
  const loadLayer = async ({ id, label }: (typeof CLAIM_LAYERS)[number]) => {
    const params = new URLSearchParams({
      where: "TENURE_STATUS IN ('Active','Pending')",
      geometry,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: [
        "OBJECTID", "GRANT_NUMBER", "CLAIM_NAME", "TENURE_STATUS",
        "OWNER_NAME", "RECORDED_DATE", "EXPIRY_DATE", "DISTRICT_NAME",
      ].join(","),
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: String(MAX_FEATURES_PER_LAYER),
      f: "geojson",
    });
    const countParams = new URLSearchParams(params);
    countParams.set("f", "json");
    countParams.set("returnCountOnly", "true");
    const [countResponse, featureResponse] = await Promise.all([
      fetch(`${SERVICE}/${id}/query?${countParams}`, { next: { revalidate: 900 } }),
      fetch(`${SERVICE}/${id}/query?${params}`, { next: { revalidate: 900 } }),
    ]);
    if (!countResponse.ok || !featureResponse.ok) throw new Error("Yukon source unavailable");
    const [countPayload, featurePayload] = await Promise.all([
      countResponse.json(),
      featureResponse.json(),
    ]);
    return {
      count: Number(countPayload.count || 0),
      features: (featurePayload.features || []).map((feature: { properties?: Record<string, unknown> }) => ({
        ...feature,
        properties: { ...(feature.properties || {}), _WANISKA_CLAIM_TYPE: label },
      })),
    };
  };

  try {
    const results = await Promise.all(CLAIM_LAYERS.map(loadLayer));
    const count = results.reduce((sum, result) => sum + result.count, 0);
    return NextResponse.json({
      type: "FeatureCollection",
      features: results.flatMap(result => result.features),
      metadata: {
        count,
        truncated: results.some(result => result.count > MAX_FEATURES_PER_LAYER),
        requiresZoom: false,
        source: "Government of Yukon GeoYukon — Placer and Quartz Claims",
        sourceUrl: `${SERVICE}/11`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Yukon GeoYukon is temporarily unavailable." }, { status: 502 });
  }
}
