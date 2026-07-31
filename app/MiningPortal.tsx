"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GeoJSON as LeafletGeoJSON, Map as LeafletMap } from "leaflet";

type MiningKind = "claim" | "exploration" | "lease" | "mine";
type MiningProperties = {
  id: string;
  name: string;
  kind: MiningKind;
  kindLabel: string;
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
};
type MiningFeature = Feature<Geometry, MiningProperties>;
type MiningDataset = FeatureCollection<Geometry, MiningProperties> & {
  metadata: {
    generatedAt: string;
    source: string;
    sourceUrl: string;
    treatyBoundaryNote: string;
    featureCount: number;
    counts: Record<MiningKind, number>;
    treatyCounts: Record<string, number>;
  };
};

const territories = ["All Manitoba", "Treaty 1", "Treaty 2", "Treaty 3", "Treaty 4", "Treaty 5"];
const kindMeta: Record<MiningKind, { label: string; short: string; color: string }> = {
  claim: { label: "Mining claims", short: "Claims", color: "#d49a3a" },
  exploration: { label: "Exploration licences", short: "Exploration", color: "#337a72" },
  lease: { label: "Mineral leases", short: "Leases", color: "#8b5a83" },
  mine: { label: "Mine sites", short: "Mine sites", color: "#c6543d" },
};

function WatchLogo() {
  return <img className="watch-logo" src="/waniska-watch-logo.png" alt="Waniskâ Watch" />;
}

function readableStatus(status: string | null) {
  if (!status) return "Status not published";
  return status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function fmt(value: number | null | undefined) {
  return value == null ? "—" : Math.round(value).toLocaleString("en-CA");
}

export default function MiningPortal() {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const mapLayer = useRef<LeafletGeoJSON | null>(null);
  const [dataset, setDataset] = useState<MiningDataset | null>(null);
  const [territory, setTerritory] = useState("All Manitoba");
  const [kinds, setKinds] = useState<Set<MiningKind>>(new Set(["claim", "exploration", "lease", "mine"]));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MiningFeature | null>(null);
  const [listLimit, setListLimit] = useState(80);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    fetch("/data/manitoba-mining.json")
      .then(response => response.json())
      .then((data: MiningDataset) => setDataset(data))
      .catch(() => setDataset(null));
  }, []);

  const filtered = useMemo(() => {
    if (!dataset) return [];
    const normalized = query.trim().toLowerCase();
    return dataset.features.filter(feature => {
      const item = feature.properties;
      if (territory !== "All Manitoba" && item.treaty !== territory) return false;
      if (!kinds.has(item.kind)) return false;
      if (!normalized) return true;
      return [item.id, item.name, item.holder, item.commodity, item.status]
        .some(value => String(value ?? "").toLowerCase().includes(normalized));
    });
  }, [dataset, territory, kinds, query]);

  const filteredCounts = useMemo(() => {
    const counts: Record<MiningKind, number> = { claim: 0, exploration: 0, lease: 0, mine: 0 };
    filtered.forEach(feature => counts[feature.properties.kind]++);
    return counts;
  }, [filtered]);

  useEffect(() => {
    if (!mapElement.current || mapInstance.current) return;
    let cancelled = false;
    import("leaflet").then(L => {
      if (cancelled || !mapElement.current) return;
      const map = L.map(mapElement.current, { preferCanvas: true, zoomControl: false, minZoom: 4 }).setView([55.15, -97.2], 5);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: 'Map © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 17,
      }).addTo(map);
      mapInstance.current = map;
      setMapReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    let active = true;
    import("leaflet").then(L => {
      if (!active || !mapInstance.current) return;
      if (mapLayer.current) mapLayer.current.remove();
      const collection: FeatureCollection<Geometry, MiningProperties> = { type: "FeatureCollection", features: filtered };
      const layer = L.geoJSON(collection, {
        style: feature => {
          const meta = kindMeta[(feature?.properties as MiningProperties).kind];
          return { color: meta.color, weight: 1, fillColor: meta.color, fillOpacity: 0.34 };
        },
        pointToLayer: (feature, latlng) => {
          const meta = kindMeta[(feature.properties as MiningProperties).kind];
          return L.circleMarker(latlng, { radius: 5.5, color: "#ffffff", weight: 1.5, fillColor: meta.color, fillOpacity: 0.92 });
        },
        onEachFeature: (feature, itemLayer) => {
          itemLayer.on("click", () => setSelected(feature as MiningFeature));
          const props = feature.properties as MiningProperties;
          itemLayer.bindTooltip(`<strong>${props.name || props.id}</strong><br>${props.kindLabel} · ${props.treaty}`, { sticky: true });
        },
      }).addTo(mapInstance.current);
      mapLayer.current = layer;
      if (filtered.length && territory !== "All Manitoba") {
        const bounds = layer.getBounds();
        if (bounds.isValid()) mapInstance.current.fitBounds(bounds.pad(0.08), { maxZoom: 8 });
      } else if (territory === "All Manitoba") {
        mapInstance.current.setView([55.15, -97.2], 5);
      }
    });
    return () => { active = false; };
  }, [filtered, mapReady, territory]);

  useEffect(() => {
    setListLimit(80);
    setSelected(null);
  }, [territory, query, kinds]);

  function toggleKind(kind: MiningKind) {
    setKinds(current => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next;
    });
  }

  function exportRecords() {
    const columns: Array<[string, keyof MiningProperties]> = [
      ["Disposition", "id"],
      ["Name", "name"],
      ["Type", "kindLabel"],
      ["Status", "status"],
      ["Treaty territory", "treaty"],
      ["Recorded holder / owner", "holder"],
      ["Commodity", "commodity"],
      ["Area (ha)", "areaHa"],
      ["Issue date", "issueDate"],
      ["Expiry date", "expiryDate"],
      ["Latitude", "latitude"],
      ["Longitude", "longitude"],
    ];
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
    const csv = [
      columns.map(([label]) => quote(label)).join(","),
      ...filtered.map(feature => columns.map(([, key]) => quote(feature.properties[key])).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `waniska-mineral-records-${territory.toLowerCase().replaceAll(" ", "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function focusFeature(feature: MiningFeature) {
    setSelected(feature);
    mapInstance.current?.flyTo(
      [feature.properties.latitude, feature.properties.longitude],
      feature.properties.kind === "mine" ? 11 : 9,
      { duration: 0.7 },
    );
  }

  const visibleHolderCount = filtered.filter(feature => feature.properties.holder).length;
  const updated = dataset ? new Date(dataset.metadata.generatedAt).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "Loading";

  return <main className="mining-portal">
    <header className="mining-header">
      <a className="mining-brand" href="/"><WatchLogo /></a>
      <nav aria-label="Mining portal navigation"><a href="#map">Map</a><a href="#records">Records</a><a href="#method">About the data</a></nav>
      <a className="mining-government-link" href="https://web33.gov.mb.ca/imaqs/page/viewer/mineralSearch/searchForm.jsf" target="_blank" rel="noreferrer">Open Manitoba iMaQs ↗</a>
    </header>

    <section className="mining-intro">
      <div>
        <span className="mining-eyebrow">COMMUNITY MINERAL INTELLIGENCE · MANITOBA</span>
        <h1>See what mineral activity is happening in your treaty territory.</h1>
        <p>Explore current claims, exploration licences, mineral leases, and mine sites in one community-first view—with exact mapped locations and source evidence.</p>
      </div>
      <div className="mining-freshness"><i /><div><span>GOVERNMENT DATA SNAPSHOT</span><strong>Current as of {updated}</strong><small>{dataset ? `${dataset.metadata.featureCount.toLocaleString("en-CA")} mapped records` : "Loading current records…"}</small></div></div>
    </section>

    <section className="mining-territory-strip" aria-label="Choose treaty territory">
      <span>VIEW TERRITORY</span>
      <div>{territories.map(item => <button key={item} className={territory === item ? "active" : ""} onClick={() => setTerritory(item)}>{item}<small>{item === "All Manitoba" ? dataset?.metadata.featureCount.toLocaleString("en-CA") : dataset?.metadata.treatyCounts[item]?.toLocaleString("en-CA")}</small></button>)}</div>
    </section>

    <section className="mining-kpis">
      {(Object.keys(kindMeta) as MiningKind[]).map(kind => <article key={kind}><span style={{ "--kind": kindMeta[kind].color } as React.CSSProperties} /><div><small>{kindMeta[kind].label.toUpperCase()}</small><strong>{filteredCounts[kind].toLocaleString("en-CA")}</strong><p>{territory === "All Manitoba" ? "Across Manitoba" : `Primary overlap with ${territory}`}</p></div></article>)}
    </section>

    <section className="mining-workspace" id="map">
      <aside className="mining-controls">
        <div className="mining-control-head"><div><span className="mining-eyebrow">MAP CONTROLS</span><h2>Find activity</h2></div><b>{filtered.length.toLocaleString("en-CA")}</b></div>
        <label className="mining-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Claim, company, commodity…" aria-label="Search mining records" />{query && <button onClick={() => setQuery("")} aria-label="Clear search">×</button>}</label>
        <button className="mining-export" onClick={exportRecords} disabled={!filtered.length}>Export visible records · CSV</button>
        <div className="mining-layer-list">
          <span>MAP LAYERS</span>
          {(Object.keys(kindMeta) as MiningKind[]).map(kind => <label key={kind}><input type="checkbox" checked={kinds.has(kind)} onChange={() => toggleKind(kind)} /><i style={{ background: kindMeta[kind].color }} /><strong>{kindMeta[kind].short}</strong><small>{filteredCounts[kind].toLocaleString("en-CA")}</small></label>)}
        </div>
        <div className="mining-results-mini" id="records">
          <div><span>RECORDS</span><small>Click to locate</small></div>
          {!dataset && <p className="mining-loading">Loading government records…</p>}
          {dataset && !filtered.length && <p className="mining-loading">No records match these filters.</p>}
          {filtered.slice(0, listLimit).map(feature => <button key={String(feature.id)} className={selected?.id === feature.id ? "active" : ""} onClick={() => focusFeature(feature)}><i style={{ background: kindMeta[feature.properties.kind].color }} /><span><strong>{feature.properties.name || feature.properties.id}</strong><small>{feature.properties.id} · {feature.properties.treaty}</small></span><b>›</b></button>)}
          {filtered.length > listLimit && <button className="mining-load-more" onClick={() => setListLimit(limit => limit + 80)}>Show more records</button>}
        </div>
      </aside>

      <div className="mining-map-wrap">
        <div ref={mapElement} className="mining-map" aria-label="Interactive map of Manitoba mineral activity" />
        <div className="mining-map-badge"><span>PRIMARY TERRITORY VIEW</span><strong>{territory}</strong></div>
        <div className="mining-map-source">Approximate treaty geography · click any shape for details</div>
        {selected && <article className="mining-detail">
          <button className="mining-detail-close" onClick={() => setSelected(null)} aria-label="Close record details">×</button>
          <div className="mining-detail-type"><i style={{ background: kindMeta[selected.properties.kind].color }} />{selected.properties.kindLabel}<b>{readableStatus(selected.properties.status)}</b></div>
          <h2>{selected.properties.name || selected.properties.id}</h2>
          <p className="mining-detail-id">Disposition {selected.properties.id}</p>
          <dl>
            <div><dt>Treaty territory</dt><dd>{selected.properties.treaty}</dd></div>
            <div><dt>Recorded holder / owner</dt><dd>{selected.properties.holder || "Ownership research pending"}</dd></div>
            <div><dt>Area</dt><dd>{selected.properties.areaHa == null ? "Not published" : `${fmt(selected.properties.areaHa)} ha`}</dd></div>
            <div><dt>Commodity</dt><dd>{selected.properties.commodity || "Not published"}</dd></div>
            <div><dt>Issue date</dt><dd>{selected.properties.issueDate || "Not published"}</dd></div>
            <div><dt>Expiry date</dt><dd>{selected.properties.expiryDate || "Not published"}</dd></div>
            <div><dt>Coordinates</dt><dd>{selected.properties.latitude.toFixed(4)}, {selected.properties.longitude.toFixed(4)}</dd></div>
          </dl>
          <a href={`https://web33.gov.mb.ca/imaqs/page/viewer/mineralSearch/searchForm.jsf`} target="_blank" rel="noreferrer">Verify in Manitoba iMaQs ↗</a>
          <small>{selected.properties.holderEvidence ? `Holder evidence: ${selected.properties.holderEvidence}` : "Holder enrichment is added only when a public source can be verified."}</small>
        </article>}
      </div>
    </section>

    <section className="mining-method" id="method">
      <div><span className="mining-eyebrow">DESIGNED FOR INFORMED ENGAGEMENT</span><h2>From a provincial data layer to a Nation-ready briefing.</h2><p>The portal keeps source facts, geographic assignments, and research confidence separate—so communities can see what is known, what is inferred, and what still needs verification.</p></div>
      <div className="mining-method-grid">
        <article><b>01</b><strong>Locate</strong><p>Find the exact claim, lease, licence, or mine-site geometry.</p></article>
        <article><b>02</b><strong>Understand</strong><p>Review status, dates, area, commodity, and treaty overlap.</p></article>
        <article><b>03</b><strong>Identify</strong><p>Connect recorded holders to operators and corporate parents with evidence.</p></article>
        <article><b>04</b><strong>Prepare</strong><p>Export a territory-specific record set for leadership and engagement teams.</p></article>
      </div>
      <div className="mining-caution"><span>i</span><p><strong>Important boundary note.</strong> Treaty polygons are an approximate geographic index. They do not determine legal rights, traditional territory, duty-to-consult obligations, or the treaty affiliation of a nearby First Nation.</p></div>
      <div className="mining-method-meta"><span>{visibleHolderCount.toLocaleString("en-CA")} visible records currently include a published holder or owner</span><a href={dataset?.metadata.sourceUrl || "https://rdmaps.gov.mb.ca/arcgis/rest/services/iMaQs/imaqsMining/MapServer"} target="_blank" rel="noreferrer">Government of Manitoba source ↗</a></div>
    </section>

    <footer className="mining-footer">
      <div className="mining-footer-primary">
        <a className="mining-brand" href="/"><WatchLogo /></a>
        <p>Community-first mineral intelligence for informed decisions.</p>
      </div>
      <a className="mining-product-of" href="https://waniskaservices.ca/" target="_blank" rel="noreferrer">
        <span>A PRODUCT OF</span>
        <img src="/waniska-services-logo.png" alt="Waniskâ Services" />
      </a>
      <span className="mining-footer-source">Government data · Independent presentation</span>
    </footer>
  </main>;
}
