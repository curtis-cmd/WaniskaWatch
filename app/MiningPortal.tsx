"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GeoJSON as LeafletGeoJSON, LatLngBounds, Layer as LeafletLayer, Map as LeafletMap, PathOptions } from "leaflet";

type Sector = "minerals";
type ActivityKind = "claim" | "exploration" | "lease" | "mine";
type DataStatus = "loading" | "ready" | "error";
type ProvinceKey =
  | "manitoba"
  | "saskatchewan"
  | "alberta"
  | "ontario"
  | "new-brunswick"
  | "nova-scotia"
  | "newfoundland-and-labrador"
  | "yukon"
  | "nunavut"
  | "british-columbia"
  | "northwest-territories"
  | "quebec";
type ContactInfo = {
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  source?: string;
};
type ActivityProperties = {
  id: string;
  name: string;
  kind: ActivityKind;
  kindLabel: string;
  sector: Sector;
  sectorLabel: string;
  status: string | null;
  treaty: string;
  areaHa: number | null;
  commodity: string | null;
  holder: string | null;
  holderEvidence: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  longitude: number;
  latitude: number;
  responsibleAuthority?: string | null;
  location?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
  sourceName?: string | null;
  lastUpdated?: string | null;
  locationAccuracy?: string | null;
  contact?: ContactInfo | null;
};
type ActivityFeature = Feature<Geometry, ActivityProperties>;
type ActivityDataset = FeatureCollection<Geometry, ActivityProperties> & {
  metadata: {
    generatedAt: string;
    source: string;
    sourceUrl: string;
    featureCount: number;
    databaseRecordCount?: number;
    counts?: Partial<Record<"claim" | "exploration" | "operation", number>>;
    recordedHolderCount?: number;
    treatyCounts?: Record<string, number>;
    claimDelivery?: "included" | "viewport-live" | "viewport-static";
    claimOverview?: string;
    locationNote?: string;
  };
};
type ClaimOverviewProperties = {
  count: number;
  bounds: [number, number, number, number];
};
type ClaimOverviewDataset = FeatureCollection<Geometry, ClaimOverviewProperties> & {
  metadata: {
    generatedAt: string;
    province: string;
    currentOnly: true;
    claimCount: number;
    cellCount: number;
    gridDegrees: number;
    note: string;
  };
};
type TreatyProperties = {
  name: string;
  year: string;
  description: string;
  color: string;
  sourceUrl: string;
};
type TreatyDataset = FeatureCollection<Geometry, TreatyProperties> & {
  metadata: {
    generatedAt: string;
    source: string;
    sourceUrl: string;
    boundaryNote: string;
  };
};
type ContactDirectory = {
  metadata: { updatedAt: string; note: string };
  contacts: Array<ContactInfo & { match: string }>;
};
type ActivityMapLayer = LeafletLayer & {
  feature?: ActivityFeature;
  setStyle?: (style: PathOptions) => void;
  setRadius?: (radius: number) => void;
  bringToFront?: () => void;
  getBounds?: () => LatLngBounds;
  closeTooltip?: () => void;
};
type ActivityLayerState = "default" | "hover" | "selected";

const mineralKinds: ActivityKind[] = ["claim", "exploration", "lease", "mine"];
const kindMeta: Record<ActivityKind, { label: string; short: string; color: string; marker: string }> = {
  claim: { label: "Mining claims", short: "Claims", color: "#b97b26", marker: "◆" },
  exploration: { label: "Exploration licences", short: "Exploration", color: "#27736b", marker: "●" },
  lease: { label: "Mineral leases", short: "Leases", color: "#76537d", marker: "■" },
  mine: { label: "Mine sites", short: "Mine sites", color: "#b84e36", marker: "▲" },
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const appPath = (path: string) => `${basePath}${path}`;
const provinces: Record<ProvinceKey, {
  name: string;
  miningPath: string;
  territoryPath: string;
  claimOverviewPath?: string;
  center: [number, number];
  zoom: number;
}> = {
  manitoba: {
    name: "Manitoba",
    miningPath: "/data/manitoba-mining.json",
    territoryPath: "/data/manitoba-treaties.json",
    center: [55.15, -97.2],
    zoom: 5,
  },
  saskatchewan: {
    name: "Saskatchewan",
    miningPath: "/data/saskatchewan-mining.json",
    territoryPath: "/data/saskatchewan-territories.json",
    center: [54.5, -106],
    zoom: 5,
  },
  ontario: {
    name: "Ontario",
    miningPath: "/data/ontario-mining.json",
    territoryPath: "/data/ontario-territories.json",
    claimOverviewPath: "/data/ontario-claim-overview.json",
    center: [50.1, -85.3],
    zoom: 5,
  },
  alberta: {
    name: "Alberta",
    miningPath: "/data/alberta-mining.json",
    territoryPath: "/data/alberta-territories.json",
    center: [55, -114],
    zoom: 5,
  },
  "new-brunswick": {
    name: "New Brunswick",
    miningPath: "/data/new-brunswick-mining.json",
    territoryPath: "/data/new-brunswick-territories.json",
    center: [46.6, -66.5],
    zoom: 7,
  },
  "nova-scotia": {
    name: "Nova Scotia",
    miningPath: "/data/nova-scotia-mining.json",
    territoryPath: "/data/nova-scotia-territories.json",
    center: [45.1, -63.2],
    zoom: 7,
  },
  "newfoundland-and-labrador": {
    name: "Newfoundland and Labrador",
    miningPath: "/data/newfoundland-and-labrador-mining.json",
    territoryPath: "/data/newfoundland-and-labrador-territories.json",
    center: [53.2, -60.4],
    zoom: 4,
  },
  yukon: {
    name: "Yukon",
    miningPath: "/data/yukon-mining.json",
    territoryPath: "/data/yukon-territories.json",
    claimOverviewPath: "/data/yukon-claim-overview.json",
    center: [64.2, -135.5],
    zoom: 5,
  },
  nunavut: {
    name: "Nunavut",
    miningPath: "/data/nunavut-mining.json",
    territoryPath: "/data/nunavut-territories.json",
    claimOverviewPath: "/data/nunavut-claim-overview.json",
    center: [67.1, -92.2],
    zoom: 4,
  },
  "british-columbia": {
    name: "British Columbia",
    miningPath: "/data/british-columbia-mining.json",
    territoryPath: "/data/british-columbia-territories.json",
    claimOverviewPath: "/data/british-columbia-claim-overview.json",
    center: [54.3, -125.2],
    zoom: 5,
  },
  "northwest-territories": {
    name: "Northwest Territories",
    miningPath: "/data/northwest-territories-mining.json",
    territoryPath: "/data/northwest-territories-territories.json",
    center: [64.8, -119.6],
    zoom: 4,
  },
  quebec: {
    name: "Quebec",
    miningPath: "/data/quebec-mining.json",
    territoryPath: "/data/quebec-territories.json",
    claimOverviewPath: "/data/quebec-claim-overview.json",
    center: [52.2, -71.7],
    zoom: 5,
  },
};

const claimDetailZoom: Partial<Record<ProvinceKey, number>> = {
  ontario: 9,
  yukon: 8,
  nunavut: 7,
  "british-columbia": 8,
  quebec: 8,
};

function WatchLogo({ variant = "black" }: { variant?: "black" | "white" }) {
  return <img
    className="watch-logo"
    src={appPath(variant === "white" ? "/waniska-watch-footer.png" : "/waniska-watch-header.png")}
    alt="Waniskâ Watch"
  />;
}

function readableStatus(status: string | null) {
  if (!status) return "Status not published";
  return status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

const inactiveStatusMarkers = [
  "abandoned", "canceled", "cancelled", "closed", "conv lease", "converted to lease",
  "expired", "forfeited", "non operational", "orphaned", "past producing",
  "past-producing", "refused", "rejected", "remediated", "surrendered", "terminated", "withdrawn",
  "pending", "application",
];

const currentStatusMarkers = [
  "active", "appl exemp", "appl exten", "appl lease", "appl rff",
  "good stand", "hold", "operational", "producer", "producing mine",
  "reactivat", "reinstat",
];

function normalizedStatus(status: string | null | undefined) {
  return String(status || "").trim().toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ");
}

function isCurrentActivity(properties: ActivityProperties, asOfDate = new Date().toISOString().slice(0, 10)) {
  const status = normalizedStatus(properties.status);
  const recordType = String(properties.kindLabel || "").toLowerCase();
  if (recordType.includes("assessment file")) return false;
  if (inactiveStatusMarkers.some(marker => status.includes(marker))) return false;
  if (properties.kind === "claim" && ["converted", "leased", "refused", "withdrawn"].includes(status)) return false;
  if (properties.kind === "mine") {
    return currentStatusMarkers.some(marker => status.includes(marker)) && !status.includes("pending");
  }
  const explicitlyCurrent = currentStatusMarkers.some(marker => status.includes(marker));
  if (properties.expiryDate && properties.expiryDate.slice(0, 10) < asOfDate && !explicitlyCurrent) return false;
  return true;
}

function fmt(value: number | null | undefined) {
  return value == null ? "—" : Math.round(value).toLocaleString("en-CA");
}

function formatDate(value: string | null | undefined, fallback = "Not published") {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : parsed.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...( /^\d{4}-\d{2}-\d{2}$/.test(value) ? { timeZone: "UTC" } : {}),
    });
}

function territoryLabel(value: string) {
  return value === "Unassigned" ? "No published treaty match" : value;
}

function activityKey(feature: ActivityFeature | ActivityProperties) {
  const properties = "properties" in feature ? feature.properties : feature;
  return `${properties.kind}:${properties.id}`;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function activityTooltip(properties: ActivityProperties) {
  const title = properties.name || properties.id;
  const holder = properties.holder || "Holder not published";
  const area = properties.areaHa == null ? "Area not published" : `${fmt(properties.areaHa)} ha`;
  return `<div class="watch-claim-preview">
    <span>${escapeHtml(properties.kindLabel)}</span>
    <strong>${escapeHtml(title)}</strong>
    <small>Record ${escapeHtml(properties.id)}</small>
    <dl>
      <div><dt>Status</dt><dd>${escapeHtml(readableStatus(properties.status))}</dd></div>
      <div><dt>Holder</dt><dd>${escapeHtml(holder)}</dd></div>
      <div><dt>Area</dt><dd>${escapeHtml(area)}</dd></div>
      <div><dt>Territory</dt><dd>${escapeHtml(territoryLabel(properties.treaty))}</dd></div>
    </dl>
    <em>Select for full details</em>
  </div>`;
}

function applyActivityLayerState(layer: ActivityMapLayer, feature: ActivityFeature, state: ActivityLayerState) {
  const color = kindMeta[feature.properties.kind].color;
  layer.setStyle?.({
    color: state === "selected" ? "#f2bd56" : state === "hover" ? "#fffefa" : color,
    weight: state === "selected" ? 5 : state === "hover" ? 3.5 : 1.2,
    opacity: state === "default" ? 0.92 : 1,
    fillColor: color,
    fillOpacity: state === "selected" ? 0.74 : state === "hover" ? 0.64 : 0.4,
  });
  layer.setRadius?.(state === "selected" ? 10 : state === "hover" ? 9 : 6);
  if (state !== "default") layer.bringToFront?.();
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function geometryCentre(geometry: Geometry): [number, number] {
  const points: Array<[number, number]> = [];
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      points.push([value[0], value[1]]);
      return;
    }
    value.forEach(visit);
  };
  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach(item => {
      const centre = geometryCentre(item);
      points.push(centre);
    });
  } else {
    visit(geometry.coordinates);
  }
  if (!points.length) return [0, 0];
  const longitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const latitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  return [longitude, latitude];
}

function geometryExtent(geometry: Geometry): [number, number, number, number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      west = Math.min(west, value[0]);
      south = Math.min(south, value[1]);
      east = Math.max(east, value[0]);
      north = Math.max(north, value[1]);
      return;
    }
    value.forEach(visit);
  };
  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach(item => {
      const extent = geometryExtent(item);
      west = Math.min(west, extent[0]);
      south = Math.min(south, extent[1]);
      east = Math.max(east, extent[2]);
      north = Math.max(north, extent[3]);
    });
  } else {
    visit(geometry.coordinates);
  }
  return [west, south, east, north];
}

function pointInRing(longitude: number, latitude: number, ring: number[][]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    const intersects = ((currentPoint[1] > latitude) !== (previousPoint[1] > latitude))
      && longitude < (previousPoint[0] - currentPoint[0]) * (latitude - currentPoint[1])
      / ((previousPoint[1] - currentPoint[1]) || Number.EPSILON) + currentPoint[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInTerritory(longitude: number, latitude: number, geometry: Geometry) {
  const inPolygon = (polygon: number[][][]) => (
    Boolean(polygon[0] && pointInRing(longitude, latitude, polygon[0]))
    && !polygon.slice(1).some(ring => pointInRing(longitude, latitude, ring))
  );
  if (geometry.type === "Polygon") return inPolygon(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some(inPolygon);
  return false;
}

export default function MiningPortal() {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const activityLayer = useRef<LeafletGeoJSON | null>(null);
  const claimOverviewLayer = useRef<LeafletGeoJSON | null>(null);
  const activityFeatureLayers = useRef<Map<string, ActivityMapLayer>>(new Map());
  const treatyLayer = useRef<LeafletGeoJSON | null>(null);
  const recordButtons = useRef<Map<string, HTMLButtonElement>>(new Map());
  const supportDialog = useRef<HTMLDialogElement>(null);
  const [province, setProvince] = useState<ProvinceKey>("manitoba");
  const [miningDataset, setMiningDataset] = useState<ActivityDataset | null>(null);
  const [treatyDataset, setTreatyDataset] = useState<TreatyDataset | null>(null);
  const [liveClaims, setLiveClaims] = useState<ActivityFeature[]>([]);
  const [claimOverview, setClaimOverview] = useState<ClaimOverviewDataset | null>(null);
  const [claimViewportNote, setClaimViewportNote] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactDirectory | null>(null);
  const [dataStatus, setDataStatus] = useState<DataStatus>("loading");
  const [territory, setTerritory] = useState("All Manitoba");
  const [activeMineralKinds, setActiveMineralKinds] = useState<Set<ActivityKind>>(new Set(mineralKinds));
  const [query, setQuery] = useState("");
  const [holderFilter, setHolderFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [commodityFilter, setCommodityFilter] = useState("");
  const [issueFrom, setIssueFrom] = useState("");
  const [issueTo, setIssueTo] = useState("");
  const [selected, setSelected] = useState<ActivityFeature | null>(null);
  const [listLimit, setListLimit] = useState(60);
  const [mapReady, setMapReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const provinceConfig = provinces[province];
  const allTerritoriesLabel = `All ${provinceConfig.name}`;
  const selectedKey = selected ? activityKey(selected) : null;
  const selectedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(appPath(provinces[province].miningPath)).then(response => {
        if (!response.ok) throw new Error("Mining dataset unavailable");
        return response.json();
      }),
      fetch(appPath(provinces[province].territoryPath)).then(response => {
        if (!response.ok) throw new Error("Territory dataset unavailable");
        return response.json();
      }),
      fetch(appPath("/data/proponent-contacts.json")).then(response => {
        if (!response.ok) throw new Error("Contact directory unavailable");
        return response.json();
      }),
      provinces[province].claimOverviewPath
        ? fetch(appPath(provinces[province].claimOverviewPath)).then(response => (
          response.ok ? response.json() : null
        )).catch(() => null)
        : Promise.resolve(null),
    ]).then(([mining, treaties, directory, overview]) => {
      if (!active) return;
      setMiningDataset(mining);
      setTreatyDataset(treaties);
      setContacts(directory);
      setClaimOverview(overview);
      setDataStatus("ready");
      if (typeof window !== "undefined") {
        const recordId = new URLSearchParams(window.location.search).get("record");
        const linked = mining.features.find((feature: ActivityFeature) => (
          String(feature.properties.id) === recordId && isCurrentActivity(feature.properties)
        ));
        if (linked) {
          setSelected({
            ...linked,
            properties: {
              ...linked.properties,
              sector: "minerals",
              sectorLabel: "Minerals",
              sourceUrl: mining.metadata.sourceUrl,
              sourceName: mining.metadata.source,
              lastUpdated: linked.properties.lastUpdated || mining.metadata.generatedAt,
            },
          });
        }
      }
    }).catch(() => {
      if (!active) return;
      setMiningDataset(null);
      setTreatyDataset(null);
      setContacts(null);
      setClaimOverview(null);
      setDataStatus("error");
    });
    return () => { active = false; };
  }, [province]);

  const activities = useMemo<ActivityFeature[]>(() => {
    return [...(miningDataset?.features || []), ...liveClaims]
      .filter(feature => isCurrentActivity(feature.properties))
      .map(feature => ({
        ...feature,
        properties: {
          ...feature.properties,
          sector: "minerals" as Sector,
          sectorLabel: "Minerals",
          sourceUrl: miningDataset?.metadata.sourceUrl,
          sourceName: miningDataset?.metadata.source,
          lastUpdated: feature.properties.lastUpdated || miningDataset?.metadata.generatedAt,
        },
      }));
  }, [liveClaims, miningDataset]);

  const territoryNames = useMemo(() => {
    const published = treatyDataset?.features.map(feature => feature.properties.name)
      || ["Treaty 1", "Treaty 2", "Treaty 3", "Treaty 4", "Treaty 5"];
    const hasUnassigned = activities.some(feature => feature.properties.treaty === "Unassigned");
    return [allTerritoriesLabel, ...published, ...(hasUnassigned ? ["Unassigned"] : [])];
  }, [activities, allTerritoriesLabel, treatyDataset]);

  const territoryMeta = useMemo(() => new Map(
    treatyDataset?.features.map(feature => [feature.properties.name, feature.properties]) || [],
  ), [treatyDataset]);

  const territoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    activities.forEach(feature => {
      counts[feature.properties.treaty] = (counts[feature.properties.treaty] || 0) + 1;
    });
    return counts;
  }, [activities]);

  const filterOptions = useMemo(() => {
    const unique = (values: Array<string | null | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
    return {
      holders: unique(activities.map(feature => feature.properties.holder)),
      statuses: unique(activities.map(feature => feature.properties.status)),
      commodities: unique(activities.map(feature => feature.properties.commodity)),
    };
  }, [activities]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return activities.filter(feature => {
      const item = feature.properties;
      if (territory !== allTerritoriesLabel && item.treaty !== territory) return false;
      if (!activeMineralKinds.has(item.kind)) return false;
      if (holderFilter && item.holder !== holderFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (commodityFilter && item.commodity !== commodityFilter) return false;
      const issueYear = Number(item.issueDate?.slice(0, 4));
      if (issueFrom && (!issueYear || issueYear < Number(issueFrom))) return false;
      if (issueTo && (!issueYear || issueYear > Number(issueTo))) return false;
      if (!normalized) return true;
      return [
        item.id,
        item.name,
        item.holder,
        item.commodity,
        item.status,
        item.treaty,
        item.location,
        item.responsibleAuthority,
        item.kindLabel,
      ].some(value => String(value ?? "").toLowerCase().includes(normalized));
    });
  }, [activities, territory, allTerritoriesLabel, activeMineralKinds, query, holderFilter, statusFilter, commodityFilter, issueFrom, issueTo]);

  const listedRecords = useMemo(() => {
    const visible = filtered.slice(0, listLimit);
    if (!selected || visible.some(feature => activityKey(feature) === activityKey(selected))) return visible;
    if (!filtered.some(feature => activityKey(feature) === activityKey(selected))) return visible;
    return [selected, ...visible];
  }, [filtered, listLimit, selected]);

  const mineralCounts = useMemo(() => {
    const counts: Record<ActivityKind, number> = { claim: 0, exploration: 0, lease: 0, mine: 0 };
    activities.forEach(feature => {
      if (territory !== allTerritoriesLabel && feature.properties.treaty !== territory) return;
      counts[feature.properties.kind]++;
    });
    if (territory === allTerritoriesLabel && claimOverview) {
      counts.claim = claimOverview.metadata.claimCount;
    } else if (territory === allTerritoriesLabel && miningDataset && miningDataset.metadata.claimDelivery !== "included") {
      counts.claim = miningDataset.metadata.counts?.claim ?? counts.claim;
    }
    return counts;
  }, [activities, allTerritoriesLabel, claimOverview, miningDataset, territory]);

  const selectTerritory = useCallback((nextTerritory: string) => {
    setTerritory(nextTerritory);
    setListLimit(60);
    setSelected(null);
    setCopied(false);
    requestAnimationFrame(() => document.getElementById("territory-watch")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" }));
  }, []);

  const frameFeature = useCallback((feature: ActivityFeature) => {
    const map = mapInstance.current;
    if (!map) return;
    const container = map.getContainer();
    const isCompact = container.clientWidth < 820;
    const paddingTopLeft: [number, number] = [28, 28];
    const paddingBottomRight: [number, number] = isCompact
      ? [28, Math.min(330, Math.round(container.clientHeight * 0.48))]
      : [Math.min(470, Math.round(container.clientWidth * 0.46)), 28];
    const featureLayer = activityFeatureLayers.current.get(activityKey(feature));
    const bounds = featureLayer?.getBounds?.();
    if (bounds?.isValid()) {
      map.fitBounds(bounds.pad(0.2), {
        maxZoom: 15,
        paddingTopLeft,
        paddingBottomRight,
        animate: !prefersReducedMotion(),
      });
      return;
    }
    if (!isCompact) {
      map.once("moveend", () => map.panBy([Math.min(220, Math.round(container.clientWidth * 0.22)), 0], {
        animate: !prefersReducedMotion(),
      }));
    }
    map.flyTo(
      [feature.properties.latitude, feature.properties.longitude],
      feature.geometry.type === "Point" ? 10 : 9,
      { duration: prefersReducedMotion() ? 0 : 0.65 },
    );
  }, []);

  const selectFeature = useCallback((feature: ActivityFeature, moveMap = true) => {
    setSelected(feature);
    setCopied(false);
    if (typeof window !== "undefined") {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("record", String(feature.properties.id));
      window.history.replaceState({}, "", nextUrl);
    }
    if (moveMap) frameFeature(feature);
  }, [frameFeature]);

  useEffect(() => {
    if (!mapElement.current || mapInstance.current) return;
    let cancelled = false;
    import("leaflet").then(L => {
      if (cancelled || !mapElement.current) return;
      const map = L.map(mapElement.current, {
        preferCanvas: true,
        zoomControl: false,
        minZoom: 4,
        scrollWheelZoom: false,
      }).setView(provinceConfig.center, provinceConfig.zoom);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: 'Map © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 17,
      }).addTo(map);
      mapInstance.current = map;
      setMapReady(true);
    });
    return () => { cancelled = true; };
  }, [provinceConfig.center, provinceConfig.zoom]);

  useEffect(() => {
    if (!mapReady || !mapInstance.current || !treatyDataset) return;
    let active = true;
    import("leaflet").then(L => {
      if (!active || !mapInstance.current) return;
      if (treatyLayer.current) treatyLayer.current.remove();
      const layer = L.geoJSON(treatyDataset, {
        style: feature => {
          const props = feature?.properties as TreatyProperties;
          const highlighted = territory === allTerritoriesLabel || territory === props.name;
          return {
            color: props.color,
            dashArray: territory === props.name ? undefined : "5 4",
            weight: territory === props.name ? 4 : 2,
            opacity: highlighted ? 0.95 : 0.25,
            fillColor: props.color,
            fillOpacity: territory === props.name ? 0.2 : highlighted ? 0.07 : 0.015,
          };
        },
        onEachFeature: (feature, layerItem) => {
          const props = feature.properties as TreatyProperties;
          layerItem.bindTooltip(
            props.year ? `${props.name} · treaty signed ${props.year}` : props.name,
            { sticky: true },
          );
          layerItem.on("click", () => selectTerritory(props.name));
        },
      }).addTo(mapInstance.current);
      layer.bringToBack();
      treatyLayer.current = layer;

      if (territory !== allTerritoriesLabel && territory !== "Unassigned") {
        const selectedTreaty = treatyDataset.features.find(feature => feature.properties.name === territory);
        if (selectedTreaty) {
          const bounds = L.geoJSON(selectedTreaty).getBounds();
          if (bounds.isValid()) mapInstance.current.fitBounds(bounds.pad(0.04), { maxZoom: 7, animate: !prefersReducedMotion() });
        }
      } else {
        mapInstance.current.setView(provinceConfig.center, provinceConfig.zoom, { animate: !prefersReducedMotion() });
      }
    });
    return () => { active = false; };
  }, [allTerritoriesLabel, mapReady, provinceConfig.center, provinceConfig.zoom, selectTerritory, treatyDataset, territory]);

  useEffect(() => {
    const map = mapInstance.current;
    const viewportClaimProvince = [
      "ontario", "yukon", "nunavut", "british-columbia", "quebec",
    ].includes(province);
    if (!mapReady || !map || !viewportClaimProvince || !treatyDataset) {
      setLiveClaims([]);
      return;
    }
    let active = true;
    let controller: AbortController | null = null;
    const loadClaims = async () => {
      const zoom = map.getZoom();
      const minimumZoom = claimDetailZoom[province] ?? 8;
      const provinceName = provinces[province].name;
      if (zoom < minimumZoom) {
        controller?.abort();
        setLiveClaims([]);
        setClaimViewportNote(
          claimOverview
            ? `Gold circles summarize current ${provinceName} claims. Select one or zoom to level ${minimumZoom} to load exact claim boundaries.`
            : `Zoom in to level ${minimumZoom} or closer to load ${provinceName} claim polygons.`,
        );
        return;
      }
      controller?.abort();
      controller = new AbortController();
      const bounds = map.getBounds();
      const params = new URLSearchParams({
        west: String(bounds.getWest()),
        south: String(bounds.getSouth()),
        east: String(bounds.getEast()),
        north: String(bounds.getNorth()),
        zoom: String(zoom),
      });
      setClaimViewportNote(`Loading ${provinceName} claims in this map view…`);
      try {
        let payload: {
          features?: Array<Feature<Geometry, Record<string, string | number | null>>>;
          metadata?: { count?: number; truncated?: boolean; source?: string; sourceUrl?: string };
        };
        if (province === "quebec") {
          const indexResponse = await fetch(appPath("/data/quebec-claims/index.json"), {
            signal: controller.signal,
          });
          if (!indexResponse.ok) throw new Error("Quebec claim index unavailable");
          const index = await indexResponse.json();
          const matchingTiles = (index.tiles || []).filter((tile: { bounds: number[] }) => (
            tile.bounds[0] <= bounds.getEast()
            && tile.bounds[2] >= bounds.getWest()
            && tile.bounds[1] <= bounds.getNorth()
            && tile.bounds[3] >= bounds.getSouth()
          ));
          const tileResponses = await Promise.all(matchingTiles.map(async (tile: { file: string }) => {
            const response = await fetch(appPath(tile.file), { signal: controller?.signal });
            if (!response.ok) throw new Error("Quebec claim tile unavailable");
            return response.json();
          }));
          const unique = new Map<string, Feature<Geometry, Record<string, string | number | null>>>();
          tileResponses.flatMap(item => item.features || []).forEach((feature: Feature<Geometry, Record<string, string | number | null>>) => {
            const extent = geometryExtent(feature.geometry);
            if (
              extent[0] <= bounds.getEast()
              && extent[2] >= bounds.getWest()
              && extent[1] <= bounds.getNorth()
              && extent[3] >= bounds.getSouth()
            ) {
              unique.set(String(feature.properties?.TIT_NO || feature.id), feature);
            }
          });
          const matching = [...unique.values()];
          payload = {
            features: matching.slice(0, 2000),
            metadata: {
              count: matching.length,
              truncated: matching.length > 2000,
              source: index.metadata?.source,
              sourceUrl: index.metadata?.sourceUrl,
            },
          };
        } else {
          const response = await fetch(appPath(`/api/claims/${province}?${params}`), {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("Claim service unavailable");
          payload = await response.json();
        }
        if (!active) return;
        const claims: ActivityFeature[] = (payload.features || []).map((
          feature: Feature<Geometry, Record<string, string | number | null>>,
        ) => {
          const properties = feature.properties || {};
          const [longitude, latitude] = geometryCentre(feature.geometry);
          const treatyMatch = treatyDataset.features.find(item => (
            pointInTerritory(longitude, latitude, item.geometry)
          ));
          const dateValue = (value: string | number | null | undefined) => {
            if (value == null || value === "") return null;
            if (typeof value === "number") return new Date(value).toISOString().slice(0, 10);
            return String(value);
          };
          const id = String(
            properties.TENURE_NUMBER_ID || properties.GRANT_NUMBER || properties.CLAIM_NUM
            || properties.TIT_NO || properties.OBJECTID,
          );
          const holder = properties.HOLDER || properties.OWNER_NAME || properties.OWNERS;
          const status = properties.TENURE_STATUS_DESC || properties.TENURE_STATUS
            || properties.CLAIM_STAT || properties.STATUS;
          const issueDate = properties.ISSUE_DATE || properties.RECORDED_DATE;
          const expiryDate = properties.CLAIM_DUE_DATE || properties.EXPIRY_DATE
            || properties.GOOD_TO_DATE || properties.CANCEL_DT;
          return {
            type: "Feature",
            id: `${province}:claim:${properties.OBJECTID}`,
            geometry: feature.geometry,
            properties: {
              id,
              name: properties.CLAIM_NAME ? String(properties.CLAIM_NAME) : id,
              kind: "claim",
              kindLabel: String(properties._WANISKA_CLAIM_TYPE || properties.TITLE_TYPE || "Mining claim"),
              sector: "minerals",
              sectorLabel: "Minerals",
              status: status ? String(status) : null,
              treaty: treatyMatch?.properties.name || "Unassigned",
              areaHa: properties.AREA_HA == null
                ? properties.AREA_IN_HECTARES == null ? null : Number(properties.AREA_IN_HECTARES)
                : Number(properties.AREA_HA),
              commodity: null,
              holder: holder ? String(holder) : null,
              holderEvidence: holder ? `Published ${provinceName} government holder field` : null,
              issueDate: dateValue(issueDate),
              expiryDate: dateValue(expiryDate),
              longitude,
              latitude,
              location: properties.DISTRICT || properties.LOCATION
                ? String(properties.DISTRICT || properties.LOCATION)
                : null,
              sourceUrl: payload.metadata?.sourceUrl,
              sourceName: payload.metadata?.source,
              lastUpdated: miningDataset?.metadata.generatedAt || null,
              locationAccuracy: "Government-published claim geometry loaded for this map view",
            },
          } satisfies ActivityFeature;
        });
        setLiveClaims(claims);
        setClaimViewportNote(
          payload.metadata?.truncated
            ? `${Number(payload.metadata.count).toLocaleString("en-CA")} claims intersect this view; showing the first 2,000. Zoom in for complete local detail.`
            : `${claims.length.toLocaleString("en-CA")} ${provinceName} claim polygons loaded in this view.`,
        );
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setLiveClaims([]);
        setClaimViewportNote(`${provinceName} claim polygons could not be loaded. Try moving the map or use the official source link.`);
      }
    };
    map.on("moveend", loadClaims);
    void loadClaims();
    return () => {
      active = false;
      controller?.abort();
      map.off("moveend", loadClaims);
    };
  }, [claimOverview, mapReady, miningDataset?.metadata.generatedAt, province, treatyDataset]);

  useEffect(() => {
    const map = mapInstance.current;
    const minimumZoom = claimDetailZoom[province];
    if (!mapReady || !map || !claimOverview || minimumZoom == null || !activeMineralKinds.has("claim")) {
      claimOverviewLayer.current?.remove();
      claimOverviewLayer.current = null;
      return;
    }
    let active = true;
    let overview: LeafletGeoJSON | null = null;
    const syncVisibility = () => {
      if (!overview || !mapInstance.current) return;
      if (mapInstance.current.getZoom() < minimumZoom) {
        if (!mapInstance.current.hasLayer(overview)) overview.addTo(mapInstance.current);
      } else if (mapInstance.current.hasLayer(overview)) {
        overview.remove();
      }
    };
    import("leaflet").then(L => {
      if (!active || !mapInstance.current) return;
      claimOverviewLayer.current?.remove();
      overview = L.geoJSON(claimOverview, {
        pointToLayer: (feature, latlng) => {
          const count = Number((feature.properties as ClaimOverviewProperties).count || 0);
          return L.circleMarker(latlng, {
            radius: Math.min(14, 4 + Math.log10(count + 1) * 2.2),
            color: "#fffefa",
            weight: 2,
            fillColor: kindMeta.claim.color,
            fillOpacity: 0.78,
          });
        },
        onEachFeature: (feature, itemLayer) => {
          const properties = feature.properties as ClaimOverviewProperties;
          const count = Number(properties.count || 0);
          itemLayer.bindTooltip(
            `<div class="watch-overview-tooltip"><strong>${count.toLocaleString("en-CA")} current claims</strong><span>Aggregated in this area</span><em>Select to inspect exact claim boundaries</em></div>`,
            { sticky: true, direction: "top", opacity: 1, className: "watch-claim-overview-tip" },
          );
          itemLayer.on("click", () => {
            if (!mapInstance.current || feature.geometry.type !== "Point") return;
            const [longitude, latitude] = feature.geometry.coordinates;
            mapInstance.current.flyTo(
              [latitude, longitude],
              minimumZoom,
              { duration: prefersReducedMotion() ? 0 : 0.65 },
            );
          });
        },
      });
      claimOverviewLayer.current = overview;
      syncVisibility();
      map.on("zoomend", syncVisibility);
    });
    return () => {
      active = false;
      map.off("zoomend", syncVisibility);
      overview?.remove();
      if (claimOverviewLayer.current === overview) claimOverviewLayer.current = null;
    };
  }, [activeMineralKinds, claimOverview, mapReady, province]);

  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    let active = true;
    import("leaflet").then(L => {
      if (!active || !mapInstance.current) return;
      if (activityLayer.current) activityLayer.current.remove();
      activityFeatureLayers.current.clear();
      const collection: FeatureCollection<Geometry, ActivityProperties> = { type: "FeatureCollection", features: filtered };
      const layer = L.geoJSON(collection, {
        style: feature => {
          const props = feature?.properties as ActivityProperties;
          const color = kindMeta[props.kind].color;
          const isSelected = activityKey(props) === selectedKeyRef.current;
          return {
            color: isSelected ? "#f2bd56" : color,
            weight: isSelected ? 5 : 1.2,
            opacity: isSelected ? 1 : 0.92,
            fillColor: color,
            fillOpacity: isSelected ? 0.74 : 0.4,
          };
        },
        pointToLayer: (feature, latlng) => {
          const props = feature.properties as ActivityProperties;
          const color = kindMeta[props.kind].color;
          const isSelected = activityKey(props) === selectedKeyRef.current;
          return L.circleMarker(latlng, {
            radius: isSelected ? 10 : 6,
            color: isSelected ? "#f2bd56" : "#ffffff",
            weight: isSelected ? 5 : 2,
            fillColor: color,
            fillOpacity: 0.96,
          });
        },
        onEachFeature: (feature, itemLayer) => {
          const activityFeature = feature as ActivityFeature;
          const props = feature.properties as ActivityProperties;
          const interactiveLayer = itemLayer as ActivityMapLayer;
          activityFeatureLayers.current.set(activityKey(props), interactiveLayer);
          itemLayer.on({
            mouseover: () => applyActivityLayerState(
              interactiveLayer,
              activityFeature,
              selectedKeyRef.current === activityKey(activityFeature) ? "selected" : "hover",
            ),
            mouseout: () => applyActivityLayerState(
              interactiveLayer,
              activityFeature,
              selectedKeyRef.current === activityKey(activityFeature) ? "selected" : "default",
            ),
            click: () => {
              interactiveLayer.closeTooltip?.();
              selectFeature(activityFeature);
            },
          });
          itemLayer.bindTooltip(activityTooltip(props), {
            sticky: true,
            direction: "top",
            opacity: 1,
            className: "watch-claim-tooltip",
            offset: [0, -8],
          });
        },
      }).addTo(mapInstance.current);
      activityLayer.current = layer;
    });
    return () => { active = false; };
  }, [filtered, mapReady, selectFeature]);

  useEffect(() => {
    activityFeatureLayers.current.forEach((layer, key) => {
      const feature = layer.feature;
      if (!feature) return;
      applyActivityLayerState(layer, feature, key === selectedKey ? "selected" : "default");
    });
    if (!selectedKey) return;
    requestAnimationFrame(() => recordButtons.current.get(selectedKey)?.scrollIntoView({ block: "nearest" }));
  }, [selectedKey]);

  function beginTerritoryWatch() {
    document.getElementById("territory-watch")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  function changeProvince(nextProvince: ProvinceKey) {
    setProvince(nextProvince);
    setDataStatus("loading");
    setMiningDataset(null);
    setTreatyDataset(null);
    setLiveClaims([]);
    setClaimOverview(null);
    setClaimViewportNote(null);
    setTerritory(`All ${provinces[nextProvince].name}`);
    setSelected(null);
    setListLimit(60);
  }

  function toggleMineralKind(kind: ActivityKind) {
    setListLimit(60);
    setSelected(null);
    setCopied(false);
    setActiveMineralKinds(current => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next;
    });
  }

  function contactFor(feature: ActivityFeature) {
    if (feature.properties.contact) return feature.properties.contact;
    const holder = feature.properties.holder?.toLowerCase();
    if (!holder) return null;
    return contacts?.contacts.find(contact => holder.includes(contact.match.toLowerCase())) || null;
  }

  function updateQuery(value: string) {
    setQuery(value);
    setListLimit(60);
    setSelected(null);
    setCopied(false);
  }

  function updateAdvancedFilter(update: () => void) {
    update();
    setListLimit(60);
    setSelected(null);
    setCopied(false);
  }

  function clearAdvancedFilters() {
    setHolderFilter("");
    setStatusFilter("");
    setCommodityFilter("");
    setIssueFrom("");
    setIssueTo("");
    setListLimit(60);
    setSelected(null);
    setCopied(false);
  }

  function closeSelected() {
    setSelected(null);
    setCopied(false);
    if (typeof window !== "undefined") {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("record");
      window.history.replaceState({}, "", nextUrl);
    }
  }

  async function copySelectedLink() {
    if (!selected || typeof window === "undefined") return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("record", String(selected.properties.id));
    try {
      await navigator.clipboard.writeText(nextUrl.toString());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const publishedContact = selected ? contactFor(selected) : null;
  const identifiedProponents = miningDataset?.metadata.recordedHolderCount
    ?? new Set(filtered.map(feature => feature.properties.holder).filter(Boolean)).size;
  const generatedAt = miningDataset?.metadata.generatedAt;
  const updated = formatDate(generatedAt, "Loading");
  const boundaryUpdated = formatDate(treatyDataset?.metadata.generatedAt, "Not available");
  const selectedTerritoryMeta = territoryMeta.get(territory);
  const usesViewportClaims = ["ontario", "yukon", "nunavut", "british-columbia", "quebec"].includes(province);
  const isWaitingForViewportClaims = usesViewportClaims
    && !filtered.length
    && Boolean(
      claimViewportNote?.startsWith("Zoom in")
      || claimViewportNote?.startsWith("Gold circles"),
    );

  return <main className="territory-watch-portal" id="top">
    <a className="skip-link" href="#territory-watch">Skip to Territory Watch map</a>

    <header className="watch-header">
      <a className="watch-brand" href="#top" aria-label="Waniskâ Watch home"><WatchLogo /></a>
      <nav aria-label="Waniskâ Watch navigation">
        <a href="#territory-watch">Territory Watch</a>
        <a href="#trust">How to use the data</a>
        <a href="#sources">Sources</a>
      </nav>
      <button className="watch-support-button" type="button" onClick={() => supportDialog.current?.showModal()}>Get support</button>
    </header>

    <section className="watch-hero">
      <div className="watch-hero-copy">
        <span className="watch-eyebrow">PUBLIC MINING ACTIVITY · TERRITORIAL CONTEXT</span>
        <h1>Know what’s happening<br />on the land.</h1>
        <p>Explore current mining claims, projects and operations by province, territory, treaty area, company or claim—using public records mapped with care.</p>
        <div className="watch-hero-actions">
          <button type="button" className="watch-primary-button" onClick={beginTerritoryWatch}>Explore the map</button>
          <a href="#trust">How to use this information</a>
        </div>
      </div>

      <div className="watch-start-panel" aria-labelledby="start-heading">
        <div className="watch-start-heading">
          <span>START WITH PLACE</span>
          <b>01</b>
        </div>
        <h2 id="start-heading">Where do you want to look?</h2>
        <label>
          <span>Province or territory</span>
          <select
            value={province}
            onChange={event => changeProvince(event.target.value as ProvinceKey)}
            aria-describedby="coverage-note"
          >
            {Object.entries(provinces).sort(([, left], [, right]) => left.name.localeCompare(right.name)).map(([key, item]) => (
              <option key={key} value={key}>{item.name}</option>
            ))}
            <optgroup label="Coverage confirmation required">
              <option disabled>Prince Edward Island</option>
            </optgroup>
          </select>
        </label>
        <p id="coverage-note"><strong>{provinceConfig.name} coverage is live.</strong> Records are kept in province-specific source pipelines so differences between registries remain visible and auditable.</p>
        <fieldset>
          <legend>Choose a published geographic view</legend>
          <div className="watch-place-options">
            {territoryNames.map(item => <button
              key={item}
              type="button"
              aria-pressed={territory === item}
              className={territory === item ? "active" : ""}
              onClick={() => selectTerritory(item)}
            >
              <span>{territoryLabel(item)}</span>
              <small>{item === allTerritoriesLabel
                ? (miningDataset?.metadata.databaseRecordCount || activities.length).toLocaleString("en-CA")
                : (miningDataset?.metadata.treatyCounts?.[item] || territoryCounts[item] || 0).toLocaleString("en-CA")} records</small>
            </button>)}
          </div>
        </fieldset>
        <div className="watch-start-search">
          <label htmlFor="start-search">Or search a project, company or claim</label>
          <div>
            <input id="start-search" value={query} onChange={event => updateQuery(event.target.value)} placeholder="Name, holder or record number" />
            <button type="button" onClick={beginTerritoryWatch}>Search</button>
          </div>
        </div>
        <p className="watch-future-entry"><b>Canada expansion:</b> twelve jurisdictions now use verified government-source pipelines. Prince Edward Island remains pending until the province confirms its current mineral-right records and official map coverage.</p>
      </div>
    </section>

    <section className="watch-snapshot" aria-label="Current data coverage">
      <div><span>CURRENT PUBLIC DATA</span><strong>{updated}</strong></div>
      <div><span>{isWaitingForViewportClaims ? "MAP RECORDS" : "VISIBLE RECORDS"}</span><strong>{isWaitingForViewportClaims ? "Zoom in" : filtered.length.toLocaleString("en-CA")}</strong></div>
      <div><span>RECORDED HOLDERS</span><strong>{identifiedProponents.toLocaleString("en-CA")}</strong></div>
      <div><span>CURRENT COVERAGE</span><strong>{provinceConfig.name}</strong></div>
      <p><i /> Current activity only · no account required</p>
    </section>

    <section className="territory-watch-section" id="territory-watch" aria-labelledby="territory-watch-title">
      <div className="territory-watch-heading">
        <div>
          <span className="watch-eyebrow">TERRITORY WATCH · {provinceConfig.name.toUpperCase()}</span>
          <h2 id="territory-watch-title">{territoryLabel(territory)}</h2>
        </div>
        <div className="territory-watch-context">
          <span>{selectedTerritoryMeta ? `${selectedTerritoryMeta.year ? `Historic treaty signed ${selectedTerritoryMeta.year}` : "Published historic treaty area"}` : territory === "Unassigned" ? "No published polygon match" : "Province-wide view"}</span>
          <b>Geographic index—not a rights determination</b>
        </div>
      </div>

      <aside className="watch-reliance-banner" aria-label="Important non-reliance notice">
        <strong>Information only—do not rely on this map for legal, regulatory, consultation, investment or land-use decisions.</strong>
        <span>This view excludes clearly inactive, expired and historical records. A current government status or documented renewal/reactivation takes priority over an older due date. Public information may still be incomplete, delayed or inaccurate and must be independently verified. <a href="#legal-notice">Read the information notice.</a></span>
      </aside>

      <div className="territory-watch-workspace">
        <aside className="territory-watch-controls" aria-label="Map filters and accessible record list">
          <div className="watch-filter-section">
            <div className="watch-section-label"><span>FILTER CURRENT ACTIVITY</span><b aria-live="polite">{isWaitingForViewportClaims ? "Zoom in" : filtered.length.toLocaleString("en-CA")}</b></div>
            <label className="watch-map-search">
              <span>Search public mining records</span>
              <div>
                <input value={query} onChange={event => updateQuery(event.target.value)} placeholder="Claim, project, holder…" />
                {query && <button type="button" onClick={() => updateQuery("")} aria-label="Clear search">×</button>}
              </div>
            </label>
          </div>

          <fieldset className="watch-filter-section watch-kind-filters">
            <legend>Mining activity</legend>
            {mineralKinds.map(kind => <label key={kind}>
              <input type="checkbox" checked={activeMineralKinds.has(kind)} onChange={() => toggleMineralKind(kind)} />
              <i style={{ background: kindMeta[kind].color }} aria-hidden="true">{kindMeta[kind].marker}</i>
              <span>{kindMeta[kind].short}</span>
              <small>{mineralCounts[kind].toLocaleString("en-CA")}</small>
            </label>)}
          </fieldset>

          <details className="watch-advanced-filters">
            <summary>
              <span>Company, status and date</span>
              <small>{[holderFilter, statusFilter, commodityFilter, issueFrom, issueTo].filter(Boolean).length || "More filters"}</small>
            </summary>
            <div>
              <label>
                <span>Recorded holder or company</span>
                <select value={holderFilter} onChange={event => updateAdvancedFilter(() => setHolderFilter(event.target.value))}>
                  <option value="">All recorded holders</option>
                  {filterOptions.holders.map(holder => <option key={holder} value={holder}>{holder}</option>)}
                </select>
              </label>
              <label>
                <span>Published status</span>
                <select value={statusFilter} onChange={event => updateAdvancedFilter(() => setStatusFilter(event.target.value))}>
                  <option value="">All published statuses</option>
                  {filterOptions.statuses.map(status => <option key={status} value={status}>{readableStatus(status)}</option>)}
                </select>
              </label>
              <label>
                <span>Commodity</span>
                <select value={commodityFilter} onChange={event => updateAdvancedFilter(() => setCommodityFilter(event.target.value))}>
                  <option value="">All published commodities</option>
                  {filterOptions.commodities.map(commodity => <option key={commodity} value={commodity}>{commodity}</option>)}
                </select>
                <small>Commodity fields vary by provincial source and are not published for most claim records.</small>
              </label>
              <div className="watch-year-range">
                <label><span>Issue year from</span><input inputMode="numeric" pattern="[0-9]*" value={issueFrom} onChange={event => updateAdvancedFilter(() => setIssueFrom(event.target.value.replace(/\D/g, "").slice(0, 4)))} placeholder="e.g. 2020" /></label>
                <label><span>Issue year to</span><input inputMode="numeric" pattern="[0-9]*" value={issueTo} onChange={event => updateAdvancedFilter(() => setIssueTo(event.target.value.replace(/\D/g, "").slice(0, 4)))} placeholder="e.g. 2026" /></label>
              </div>
              {[holderFilter, statusFilter, commodityFilter, issueFrom, issueTo].some(Boolean) && <button type="button" onClick={clearAdvancedFilters}>Clear additional filters</button>}
            </div>
          </details>

          <div className="watch-record-list" id="records">
            <div className="watch-section-label"><span>ACCESSIBLE RECORD LIST</span><small>Select to locate</small></div>
            {dataStatus === "loading" && <p className="watch-state-message" role="status">Loading public records…</p>}
            {dataStatus === "error" && <p className="watch-state-message error" role="alert">The public datasets could not be loaded. Please try again or use the official source links below.</p>}
            {dataStatus === "ready" && isWaitingForViewportClaims && <p className="watch-state-message" role="status">{claimViewportNote}</p>}
            {dataStatus === "ready" && !filtered.length && !isWaitingForViewportClaims && <p className="watch-state-message" role="status">No records match this view.</p>}
            {listedRecords.map(feature => <button
              key={String(feature.id || `${feature.properties.kind}:${feature.properties.id}`)}
              type="button"
              className={selectedKey === activityKey(feature) ? "active" : ""}
              onClick={() => selectFeature(feature)}
              ref={element => {
                const key = activityKey(feature);
                if (element) recordButtons.current.set(key, element);
                else recordButtons.current.delete(key);
              }}
              data-record-id={activityKey(feature)}
              aria-label={`${feature.properties.name || feature.properties.id}, ${feature.properties.kindLabel}, ${territoryLabel(feature.properties.treaty)}`}
            >
              <i style={{ color: kindMeta[feature.properties.kind].color }} aria-hidden="true">{kindMeta[feature.properties.kind].marker}</i>
              <span><strong>{feature.properties.name || feature.properties.id}</strong><small>{feature.properties.kindLabel} · {territoryLabel(feature.properties.treaty)}</small></span>
              <b aria-hidden="true">›</b>
            </button>)}
            {filtered.length > listLimit && <button className="watch-load-more" type="button" onClick={() => setListLimit(limit => limit + 60)}>Show 60 more records</button>}
          </div>
        </aside>

        <div className="territory-watch-map-wrap">
          <p className="sr-only" id="map-description">The interactive map is paired with an accessible record list. Hover or tap a mining feature to identify it, then select it for full details. Treaty polygons are historic government-published geographic indexes and are not legal or consultation determinations.</p>
          <div ref={mapElement} className="territory-watch-map" role="region" aria-label={`Map of public ${provinceConfig.name} mining activity`} aria-describedby="map-description" />
          <div className="watch-map-legend" aria-label="Map legend">
            <strong>MAP LEGEND</strong>
            {mineralKinds.map(kind => <span key={kind}><i style={{ color: kindMeta[kind].color }} aria-hidden="true">{kindMeta[kind].marker}</i>{kindMeta[kind].short}</span>)}
            <span><i className="boundary-symbol" aria-hidden="true" />Historic treaty boundary</span>
            {usesViewportClaims && claimOverview && <span><i className="claim-overview-symbol" aria-hidden="true" />Claim activity overview</span>}
            <small>{usesViewportClaims && claimOverview
              ? "Gold circles summarize current claims at province scale. Select one to load exact boundaries."
              : "Hover or tap a claim to identify it. Select for full details."}</small>
          </div>
          <div className="watch-map-source">Boundary source: {treatyDataset?.metadata.source || "Manitoba Land Initiative"} · retrieved {boundaryUpdated}</div>
          {usesViewportClaims && claimViewportNote && <div className="watch-map-source watch-claim-load-note" role="status">{claimViewportNote}</div>}

          {selected && <article className="watch-record-detail" aria-labelledby="record-title">
            <div className="watch-record-detail-head">
              <span><i style={{ color: kindMeta[selected.properties.kind].color }} aria-hidden="true">{kindMeta[selected.properties.kind].marker}</i>{selected.properties.kindLabel}</span>
              <button type="button" onClick={closeSelected} aria-label="Close record details">×</button>
            </div>
            <div className="watch-record-status"><b>{readableStatus(selected.properties.status)}</b><span>Source verified</span></div>
            <h3 id="record-title">{selected.properties.name || selected.properties.id}</h3>
            <p>Public record ID {selected.properties.id}</p>
            {selected.properties.description && <p className="watch-record-description">{selected.properties.description}</p>}
            <dl>
              <div><dt>Province</dt><dd>{provinceConfig.name}</dd></div>
              <div><dt>Territorial context</dt><dd>{territoryLabel(selected.properties.treaty)}<small>Spatially inferred primary polygon match; other overlaps may exist</small></dd></div>
              <div><dt>Recorded holder</dt><dd>{selected.properties.holder || "Not published"}<small>{selected.properties.holderEvidence ? "Source evidence available" : "Completeness limited"}</small></dd></div>
              {selected.properties.responsibleAuthority && <div><dt>Responsible authority</dt><dd>{selected.properties.responsibleAuthority}</dd></div>}
              {selected.properties.location && <div><dt>Published location</dt><dd>{selected.properties.location}</dd></div>}
              <div><dt>Area</dt><dd>{selected.properties.areaHa == null ? "Not published" : `${fmt(selected.properties.areaHa)} ha`}</dd></div>
              <div><dt>Commodity</dt><dd>{selected.properties.commodity || "Not published"}<small>{selected.properties.commodity ? "Source verified" : "Public source incomplete"}</small></dd></div>
              <div><dt>Issue date</dt><dd>{formatDate(selected.properties.issueDate)}</dd></div>
              <div><dt>Expiry date</dt><dd>{formatDate(selected.properties.expiryDate)}</dd></div>
              <div><dt>Published coordinates</dt><dd>{selected.properties.latitude.toFixed(4)}, {selected.properties.longitude.toFixed(4)}<small>{selected.properties.locationAccuracy || "Feature geometry; field conditions not verified"}</small></dd></div>
              <div><dt>Source retrieved</dt><dd>{formatDate(selected.properties.lastUpdated)}</dd></div>
            </dl>

            <section className="watch-public-contact">
              <span>PUBLIC PROPONENT CONTACT</span>
              {publishedContact ? <>
                <strong>{publishedContact.name}</strong>
                <div>{publishedContact.email && <a href={`mailto:${publishedContact.email}`}>{publishedContact.email}</a>}{publishedContact.phone && <a href={`tel:${publishedContact.phone.replace(/[^\d+]/g, "")}`}>{publishedContact.phone}</a>}</div>
                {publishedContact.website && <a href={publishedContact.website} target="_blank" rel="noreferrer">Company contact page ↗</a>}
                <small>Contact information is taken from a public organizational source and may change.</small>
              </> : <>
                <strong>No verified public business contact is available for this record.</strong>
                <small>Waniskâ Watch does not publish private personal contact information. Use the government source or an authorized registry for outreach.</small>
              </>}
            </section>

            <div className="watch-record-actions">
              <a href={selected.properties.sourceUrl || miningDataset?.metadata.sourceUrl} target="_blank" rel="noreferrer">Open government source ↗</a>
              <button type="button" onClick={copySelectedLink}>{copied ? "Link copied" : "Copy record link"}</button>
            </div>
            <button className="watch-context-support" type="button" onClick={() => supportDialog.current?.showModal()}>Need help interpreting this record?</button>
            <p className="watch-record-limit"><strong>Claims and licences are not evidence of consultation or consent.</strong> Verify current status with the responsible government and the relevant Nation, community, lands office or consultation office.</p>
          </article>}
        </div>
      </div>
    </section>

    <section className="watch-trust-section" id="trust">
      <div className="watch-trust-heading">
        <span className="watch-eyebrow">READ THE MAP WITH CARE</span>
        <h2>Territorial context is layered, living and sometimes contested.</h2>
      </div>
      <div className="watch-trust-points">
        <article><b>01</b><h3>A claim is not consent</h3><p>A mineral claim, licence or project record does not establish consultation, accommodation, permission or community support.</p></article>
        <article><b>02</b><h3>Boundaries can overlap</h3><p>Historic treaties, modern agreements, traditional territories, Métis homelands and Inuit regions cannot be reduced to one unquestioned boundary.</p></article>
        <article><b>03</b><h3>Public data has limits</h3><p>Government records may be incomplete, delayed or differently structured. Confirm decisions with official sources and local lands or consultation offices.</p></article>
      </div>
      <div className="watch-boundary-note">
        <strong>Current {provinceConfig.name} boundary treatment</strong>
        <p>{treatyDataset?.metadata.boundaryNote || "Government-published historic-treaty polygons are used only as a geographic index. They do not determine rights, traditional territory or duty-to-consult obligations."}</p>
        <span>Where publication is authorized, Nation-verified information will take priority over generalized government boundaries. Future Nation-authorized submissions will require governance rules consistent with Indigenous data sovereignty, including consideration of OCAP® where applicable.</span>
      </div>
    </section>

    <section className="watch-sources-section" id="sources">
      <div>
        <span className="watch-eyebrow">SOURCE REGISTER</span>
        <h2>See where the information comes from.</h2>
        <p>Waniskâ Watch keeps public records, geographic intersections and organization research separate so users can understand what is verified and what is inferred.</p>
      </div>
      <div className="watch-source-register">
        <article>
          <span>MINING RECORDS</span>
          <h3>{miningDataset?.metadata.source || "Government of Manitoba iMaQs"}</h3>
          <dl><div><dt>Retrieved</dt><dd>{updated}</dd></div><div><dt>Coverage</dt><dd>{(miningDataset?.metadata.databaseRecordCount || activities.length).toLocaleString("en-CA")} records</dd></div><div><dt>Status</dt><dd>Government source</dd></div></dl>
          <a href={miningDataset?.metadata.sourceUrl} target="_blank" rel="noreferrer">Open mining source ↗</a>
        </article>
        <article>
          <span>TERRITORIAL CONTEXT</span>
          <h3>{treatyDataset?.metadata.source || "Manitoba Land Initiative — Treaty Boundary"}</h3>
          <dl><div><dt>Retrieved</dt><dd>{boundaryUpdated}</dd></div><div><dt>Coverage</dt><dd>{treatyDataset?.features.length || 0} published treaty/agreement areas</dd></div><div><dt>Status</dt><dd>Geographic index</dd></div></dl>
          <a href={treatyDataset?.metadata.sourceUrl} target="_blank" rel="noreferrer">Open boundary source ↗</a>
        </article>
        <article>
          <span>DATA AUDIT</span>
          <h3>Current-record and source-lineage checks</h3>
          <dl><div><dt>Scope</dt><dd>Freshness, status, identifiers, counts and raw-source lineage</dd></div><div><dt>Frequency</dt><dd>Every verified refresh</dd></div><div><dt>Status</dt><dd>Public audit record</dd></div></dl>
          <a href={appPath("/data/data-audit.json")} target="_blank" rel="noreferrer">Open latest data audit ↗</a>
        </article>
      </div>
    </section>

    <section className="watch-legal-section" id="legal-notice" aria-labelledby="legal-title">
      <div className="watch-legal-heading">
        <span className="watch-eyebrow">INFORMATION NOTICE</span>
        <h2 id="legal-title">Public and third-party information</h2>
      </div>
      <div className="watch-legal-notice">
        <p>Records, maps, boundaries, contacts and links are compiled from publicly available government and other third-party sources. They may be incomplete, delayed, inaccurate, unavailable or out of date. Geographic matches and coordinates are informational approximations and may not show every overlap, interest, right or obligation.</p>
        <p><strong>The information must be independently verified and must not be relied upon.</strong> Before acting, confirm the information with the responsible government registry and the affected Nation, community, rights holder, lands office or consultation office, as appropriate.</p>
      </div>
    </section>

    <section className="watch-services-band">
      <div><span>COMMUNITY SUPPORT</span><h2>Need a deeper project or territory briefing?</h2><p>Waniskâ Services can support research, project review, consultation readiness, strategic planning and community briefings.</p></div>
      <button type="button" onClick={() => supportDialog.current?.showModal()}>Talk with Waniskâ Services</button>
    </section>

    <footer className="watch-footer">
      <div><a href="#top" aria-label="Waniskâ Watch home"><WatchLogo variant="white" /></a><p>See the activity. Know the territory.</p></div>
      <a className="watch-services-brand" href="https://waniskaservices.ca/" target="_blank" rel="noreferrer">
        <span>A free community resource from Waniskâ Services.</span>
        <img src={appPath("/waniska-services-logo.png")} alt="" />
      </a>
      <p>Government data · Independent presentation<br />No account required · <a href="#legal-notice">Information notice</a></p>
    </footer>

    <dialog className="watch-support-dialog" ref={supportDialog} aria-labelledby="support-title">
      <form method="dialog"><button type="submit" aria-label="Close support information">×</button></form>
      <span className="watch-eyebrow">WANISKÂ SERVICES</span>
      <h2 id="support-title">Support for the work behind the map.</h2>
      <p>Waniskâ Services is an Indigenous-owned consulting and advisory firm. We can help communities turn public project information into practical research, planning and engagement tools.</p>
      <ul>
        <li>Mining and major-project research</li>
        <li>Consultation and engagement readiness</li>
        <li>Strategic and community planning</li>
        <li>Government relations and facilitation</li>
        <li>Custom territory and project briefings</li>
      </ul>
      <div>
        <a href="mailto:info@waniskaservices.ca">info@waniskaservices.ca</a>
        <a href="https://waniskaservices.ca/" target="_blank" rel="noreferrer">Visit Waniskâ Services ↗</a>
      </div>
      <small>Do not include confidential cultural, land-use or personal information in an initial inquiry.</small>
    </dialog>
  </main>;
}
