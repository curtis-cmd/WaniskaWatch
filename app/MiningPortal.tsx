"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GeoJSON as LeafletGeoJSON, Map as LeafletMap } from "leaflet";

type Sector = "minerals" | "water" | "pollution" | "forestry" | "energy" | "infrastructure" | "land-use";
type ActivityKind = "claim" | "exploration" | "lease" | "mine" | "assessment" | "licence";
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
    treatyCounts?: Record<string, number>;
    locationNote?: string;
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

const sectors: Sector[] = ["minerals", "water", "pollution", "forestry", "energy", "infrastructure", "land-use"];
const sectorMeta: Record<Sector, { label: string; short: string; color: string }> = {
  minerals: { label: "Minerals & mining", short: "Minerals", color: "#c88b2d" },
  water: { label: "Water management", short: "Water", color: "#277da1" },
  pollution: { label: "Pollution & waste", short: "Pollution", color: "#b45d48" },
  forestry: { label: "Forestry", short: "Forestry", color: "#527c4b" },
  energy: { label: "Energy & petroleum", short: "Energy", color: "#76589b" },
  infrastructure: { label: "Infrastructure & transport", short: "Infrastructure", color: "#4e7188" },
  "land-use": { label: "Land use", short: "Land use", color: "#8a6c4d" },
};
const mineralKinds: ActivityKind[] = ["claim", "exploration", "lease", "mine"];
const kindMeta: Record<string, { label: string; short: string; color: string }> = {
  claim: { label: "Mining claims", short: "Claims", color: "#d49a3a" },
  exploration: { label: "Exploration licences", short: "Exploration", color: "#337a72" },
  lease: { label: "Mineral leases", short: "Leases", color: "#8b5a83" },
  mine: { label: "Mine sites", short: "Mine sites", color: "#c6543d" },
  assessment: { label: "Assessment records", short: "Assessments", color: "#4e7188" },
  licence: { label: "Public licences", short: "Licences", color: "#527c4b" },
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
  const activityLayer = useRef<LeafletGeoJSON | null>(null);
  const treatyLayer = useRef<LeafletGeoJSON | null>(null);
  const [miningDataset, setMiningDataset] = useState<ActivityDataset | null>(null);
  const [sectorDataset, setSectorDataset] = useState<ActivityDataset | null>(null);
  const [treatyDataset, setTreatyDataset] = useState<TreatyDataset | null>(null);
  const [contacts, setContacts] = useState<ContactDirectory | null>(null);
  const [territory, setTerritory] = useState("All Manitoba");
  const [activeSectors, setActiveSectors] = useState<Set<Sector>>(new Set(sectors));
  const [activeMineralKinds, setActiveMineralKinds] = useState<Set<ActivityKind>>(new Set(mineralKinds));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ActivityFeature | null>(null);
  const [listLimit, setListLimit] = useState(80);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/data/manitoba-mining.json").then(response => response.json()),
      fetch("/data/manitoba-sectors.json").then(response => response.json()),
      fetch("/data/manitoba-treaties.json").then(response => response.json()),
      fetch("/data/proponent-contacts.json").then(response => response.json()),
    ]).then(([mining, publicProjects, treaties, directory]) => {
      setMiningDataset(mining);
      setSectorDataset(publicProjects);
      setTreatyDataset(treaties);
      setContacts(directory);
    }).catch(() => {
      setMiningDataset(null);
      setSectorDataset(null);
      setTreatyDataset(null);
    });
  }, []);

  const activities = useMemo<ActivityFeature[]>(() => {
    const mining = (miningDataset?.features || []).map(feature => ({
      ...feature,
      properties: {
        ...feature.properties,
        sector: "minerals" as Sector,
        sectorLabel: "Minerals",
        sourceUrl: miningDataset?.metadata.sourceUrl,
        sourceName: miningDataset?.metadata.source,
      },
    }));
    return [...mining, ...(sectorDataset?.features || [])];
  }, [miningDataset, sectorDataset]);

  const territoryNames = useMemo(() => [
    "All Manitoba",
    ...(treatyDataset?.features.map(feature => feature.properties.name) || ["Treaty 1", "Treaty 2", "Treaty 3", "Treaty 4", "Treaty 5"]),
  ], [treatyDataset]);

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

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return activities.filter(feature => {
      const item = feature.properties;
      if (territory !== "All Manitoba" && item.treaty !== territory) return false;
      if (!activeSectors.has(item.sector)) return false;
      if (item.sector === "minerals" && mineralKinds.includes(item.kind) && !activeMineralKinds.has(item.kind)) return false;
      if (!normalized) return true;
      return [
        item.id, item.name, item.holder, item.commodity, item.status, item.sectorLabel,
        item.responsibleAuthority, item.location,
      ].some(value => String(value ?? "").toLowerCase().includes(normalized));
    });
  }, [activities, territory, activeSectors, activeMineralKinds, query]);

  const sectorCounts = useMemo(() => {
    const counts = Object.fromEntries(sectors.map(sector => [sector, 0])) as Record<Sector, number>;
    activities.forEach(feature => {
      if (territory === "All Manitoba" || feature.properties.treaty === territory) counts[feature.properties.sector]++;
    });
    return counts;
  }, [activities, territory]);

  const mineralCounts = useMemo(() => {
    const counts: Record<string, number> = { claim: 0, exploration: 0, lease: 0, mine: 0 };
    activities.forEach(feature => {
      if (feature.properties.sector !== "minerals") return;
      if (territory !== "All Manitoba" && feature.properties.treaty !== territory) return;
      if (counts[feature.properties.kind] != null) counts[feature.properties.kind]++;
    });
    return counts;
  }, [activities, territory]);

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
    if (!mapReady || !mapInstance.current || !treatyDataset) return;
    let active = true;
    import("leaflet").then(L => {
      if (!active || !mapInstance.current) return;
      if (treatyLayer.current) treatyLayer.current.remove();
      const layer = L.geoJSON(treatyDataset, {
        style: feature => {
          const props = feature?.properties as TreatyProperties;
          const highlighted = territory === "All Manitoba" || territory === props.name;
          return {
            color: props.color,
            weight: territory === props.name ? 3.5 : 2,
            opacity: highlighted ? 0.9 : 0.28,
            fillColor: props.color,
            fillOpacity: territory === props.name ? 0.18 : highlighted ? 0.075 : 0.018,
          };
        },
        onEachFeature: (feature, layerItem) => {
          const props = feature.properties as TreatyProperties;
          layerItem.bindTooltip(`${props.name} · signed ${props.year}`, { sticky: true });
          layerItem.on("click", () => setTerritory(props.name));
        },
      }).addTo(mapInstance.current);
      layer.bringToBack();
      treatyLayer.current = layer;

      if (territory !== "All Manitoba") {
        const selectedTreaty = treatyDataset.features.find(feature => feature.properties.name === territory);
        if (selectedTreaty) {
          const bounds = L.geoJSON(selectedTreaty).getBounds();
          if (bounds.isValid()) mapInstance.current.fitBounds(bounds.pad(0.04), { maxZoom: 7 });
        }
      } else {
        mapInstance.current.setView([55.15, -97.2], 5);
      }
    });
    return () => { active = false; };
  }, [mapReady, treatyDataset, territory]);

  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    let active = true;
    import("leaflet").then(L => {
      if (!active || !mapInstance.current) return;
      if (activityLayer.current) activityLayer.current.remove();
      const collection: FeatureCollection<Geometry, ActivityProperties> = { type: "FeatureCollection", features: filtered };
      const layer = L.geoJSON(collection, {
        style: feature => {
          const props = feature?.properties as ActivityProperties;
          const color = props.sector === "minerals" && kindMeta[props.kind] ? kindMeta[props.kind].color : sectorMeta[props.sector].color;
          return { color, weight: 1, fillColor: color, fillOpacity: 0.38 };
        },
        pointToLayer: (feature, latlng) => {
          const props = feature.properties as ActivityProperties;
          const color = sectorMeta[props.sector].color;
          return L.circleMarker(latlng, { radius: props.kind === "assessment" ? 5 : 5.5, color: "#ffffff", weight: 1.4, fillColor: color, fillOpacity: 0.94 });
        },
        onEachFeature: (feature, itemLayer) => {
          const props = feature.properties as ActivityProperties;
          itemLayer.on("click", () => setSelected(feature as ActivityFeature));
          itemLayer.bindTooltip(`${props.name || props.id} — ${props.sectorLabel} · ${props.treaty}`, { sticky: true });
        },
      }).addTo(mapInstance.current);
      activityLayer.current = layer;
    });
    return () => { active = false; };
  }, [filtered, mapReady]);

  useEffect(() => {
    setListLimit(80);
    setSelected(null);
  }, [territory, query, activeSectors, activeMineralKinds]);

  function toggleSector(sector: Sector) {
    setActiveSectors(current => {
      const next = new Set(current);
      if (next.has(sector)) next.delete(sector); else next.add(sector);
      return next;
    });
  }

  function toggleMineralKind(kind: ActivityKind) {
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

  function exportRecords() {
    const columns: Array<[string, keyof ActivityProperties]> = [
      ["Record ID", "id"], ["Name", "name"], ["Sector", "sectorLabel"], ["Type", "kindLabel"],
      ["Status", "status"], ["Treaty territory", "treaty"], ["Proponent / recorded holder", "holder"],
      ["Responsible authority", "responsibleAuthority"], ["Commodity", "commodity"], ["Area (ha)", "areaHa"],
      ["Start / issue date", "issueDate"], ["Expiry date", "expiryDate"], ["Latitude", "latitude"],
      ["Longitude", "longitude"], ["Public source", "sourceUrl"],
    ];
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
    const csv = [
      columns.map(([label]) => quote(label)).join(","),
      ...filtered.map(feature => columns.map(([, key]) => quote(feature.properties[key])).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `waniska-watch-records-${territory.toLowerCase().replaceAll(" ", "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function focusFeature(feature: ActivityFeature) {
    setSelected(feature);
    mapInstance.current?.flyTo([feature.properties.latitude, feature.properties.longitude], feature.geometry.type === "Point" ? 9 : 8, { duration: 0.7 });
  }

  const publishedContact = selected ? contactFor(selected) : null;
  const identifiedProponents = new Set(filtered.map(feature => feature.properties.holder).filter(Boolean)).size;
  const generatedAt = [miningDataset?.metadata.generatedAt, sectorDataset?.metadata.generatedAt].filter(Boolean).sort().at(-1);
  const updated = generatedAt ? new Date(generatedAt).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "Loading";

  return <main className="mining-portal">
    <header className="mining-header">
      <a className="mining-brand" href="/"><WatchLogo /></a>
      <nav aria-label="Waniskâ Watch navigation"><a href="#map">Map</a><a href="#records">Records</a><a href="#method">About the data</a></nav>
      <a className="mining-government-link" href="#method">Public data sources ↓</a>
    </header>

    <section className="mining-intro">
      <div>
        <span className="mining-eyebrow">TREATY TERRITORY ENVIRONMENTAL INTELLIGENCE · MANITOBA</span>
        <h1>See the projects and pressures shaping your treaty territory.</h1>
        <p>Combine mining, water, forestry, energy, pollution, infrastructure and land-use lenses in one community-first map—with public proponents, source evidence and official historic-treaty boundaries.</p>
      </div>
      <div className="mining-freshness"><i /><div><span>PUBLIC DATA SNAPSHOT</span><strong>Current as of {updated}</strong><small>{activities.length ? `${activities.length.toLocaleString("en-CA")} mapped records` : "Loading public records…"}</small></div></div>
    </section>

    <section className="mining-territory-strip" aria-label="Choose treaty territory">
      <span>VIEW TERRITORY</span>
      <div>{territoryNames.map(item => {
        const meta = territoryMeta.get(item);
        return <button
          key={item}
          className={territory === item ? "active" : ""}
          style={{ "--territory": meta?.color || "#194f4b" } as React.CSSProperties}
          onClick={() => setTerritory(item)}
        >{meta && <i />}{item}<small>{item === "All Manitoba" ? activities.length.toLocaleString("en-CA") : territoryCounts[item]?.toLocaleString("en-CA") || "0"}</small></button>;
      })}</div>
    </section>

    <section className="mining-kpis">
      <article><span style={{ "--kind": "#194f4b" } as React.CSSProperties} /><div><small>VISIBLE RECORDS</small><strong>{filtered.length.toLocaleString("en-CA")}</strong><p>{territory}</p></div></article>
      <article><span style={{ "--kind": "#c88b2d" } as React.CSSProperties} /><div><small>SECTOR LENSES</small><strong>{activeSectors.size}</strong><p>Combine or isolate sectors</p></div></article>
      <article><span style={{ "--kind": "#277da1" } as React.CSSProperties} /><div><small>PROPONENTS / HOLDERS</small><strong>{identifiedProponents.toLocaleString("en-CA")}</strong><p>Publicly named in source data</p></div></article>
      <article><span style={{ "--kind": "#7a63a8" } as React.CSSProperties} /><div><small>TREATY AREAS</small><strong>{treatyDataset?.features.length || 5}</strong><p>Official provincial boundary layer</p></div></article>
    </section>

    <section className="mining-workspace" id="map">
      <aside className="mining-controls">
        <div className="mining-control-head"><div><span className="mining-eyebrow">MAP CONTROLS</span><h2>Build your view</h2></div><b>{filtered.length.toLocaleString("en-CA")}</b></div>
        <label className="mining-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Project, company, sector…" aria-label="Search public activity records" />{query && <button onClick={() => setQuery("")} aria-label="Clear search">×</button>}</label>
        <button className="mining-export" onClick={exportRecords} disabled={!filtered.length}>Export visible records · CSV</button>
        <div className="mining-layer-list mining-sector-list">
          <span>SECTOR LENSES</span>
          {sectors.map(sector => <label key={sector}><input type="checkbox" checked={activeSectors.has(sector)} onChange={() => toggleSector(sector)} /><i style={{ background: sectorMeta[sector].color }} /><strong>{sectorMeta[sector].short}</strong><small>{sectorCounts[sector].toLocaleString("en-CA")}</small></label>)}
        </div>
        {activeSectors.has("minerals") && <div className="mining-layer-list mining-sub-layer-list">
          <span>MINERAL RECORD TYPES</span>
          {mineralKinds.map(kind => <label key={kind}><input type="checkbox" checked={activeMineralKinds.has(kind)} onChange={() => toggleMineralKind(kind)} /><i style={{ background: kindMeta[kind].color }} /><strong>{kindMeta[kind].short}</strong><small>{mineralCounts[kind].toLocaleString("en-CA")}</small></label>)}
        </div>}
        <div className="mining-results-mini" id="records">
          <div><span>RECORDS</span><small>Click to locate</small></div>
          {!miningDataset && <p className="mining-loading">Loading public records…</p>}
          {miningDataset && !filtered.length && <p className="mining-loading">No records match these filters.</p>}
          {filtered.slice(0, listLimit).map(feature => <button key={String(feature.id)} className={selected?.id === feature.id ? "active" : ""} onClick={() => focusFeature(feature)}><i style={{ background: sectorMeta[feature.properties.sector].color }} /><span><strong>{feature.properties.name || feature.properties.id}</strong><small>{feature.properties.sectorLabel} · {feature.properties.treaty}</small></span><b>›</b></button>)}
          {filtered.length > listLimit && <button className="mining-load-more" onClick={() => setListLimit(limit => limit + 80)}>Show more records</button>}
        </div>
      </aside>

      <div className="mining-map-wrap">
        <div ref={mapElement} className="mining-map" aria-label="Interactive map of public environmental and industrial activity in Manitoba" />
        <div className="mining-map-badge"><span>SELECTED TREATY AREA</span><strong>{territory}</strong><small>Click a coloured boundary to focus</small></div>
        <div className="mining-map-source">Official Manitoba historic-treaty boundary layer · geographic index only</div>
        {selected && <article className="mining-detail">
          <button className="mining-detail-close" onClick={() => setSelected(null)} aria-label="Close record details">×</button>
          <div className="mining-detail-type"><i style={{ background: sectorMeta[selected.properties.sector].color }} />{selected.properties.sectorLabel}<b>{readableStatus(selected.properties.status)}</b></div>
          <h2>{selected.properties.name || selected.properties.id}</h2>
          <p className="mining-detail-id">{selected.properties.kindLabel} · {selected.properties.id}</p>
          {selected.properties.description && <p className="mining-detail-description">{selected.properties.description}</p>}
          <dl>
            <div><dt>Treaty area</dt><dd>{selected.properties.treaty}</dd></div>
            <div><dt>Proponent / recorded holder</dt><dd>{selected.properties.holder || "Not published"}</dd></div>
            {selected.properties.responsibleAuthority && <div><dt>Responsible authority</dt><dd>{selected.properties.responsibleAuthority}</dd></div>}
            {selected.properties.location && <div><dt>Published location</dt><dd>{selected.properties.location}</dd></div>}
            <div><dt>Area</dt><dd>{selected.properties.areaHa == null ? "Not published" : `${fmt(selected.properties.areaHa)} ha`}</dd></div>
            {selected.properties.commodity && <div><dt>Commodity</dt><dd>{selected.properties.commodity}</dd></div>}
            <div><dt>Start / issue date</dt><dd>{selected.properties.issueDate || "Not published"}</dd></div>
            <div><dt>Expiry date</dt><dd>{selected.properties.expiryDate || "Not published"}</dd></div>
            <div><dt>Coordinates</dt><dd>{selected.properties.latitude.toFixed(4)}, {selected.properties.longitude.toFixed(4)}</dd></div>
          </dl>
          <section className="mining-contact-card">
            <span>PUBLIC PROPONENT CONTACT</span>
            {publishedContact ? <>
              <strong>{publishedContact.name}</strong>
              <div>{publishedContact.email && <a href={`mailto:${publishedContact.email}`}>{publishedContact.email}</a>}{publishedContact.phone && <a href={`tel:${publishedContact.phone.replace(/[^\d+]/g, "")}`}>{publishedContact.phone}</a>}</div>
              {publishedContact.website && <a href={publishedContact.website} target="_blank" rel="noreferrer">Company contact page ↗</a>}
              {publishedContact.source && <small>Contact verified from the organization’s public website.</small>}
            </> : <>
              <strong>No verified public business contact is available for this record.</strong>
              <small>For individuals, Waniskâ Watch does not publish private personal contact information. Use the linked government record or corporate registry for authorized outreach.</small>
            </>}
          </section>
          <a href={selected.properties.sourceUrl || miningDataset?.metadata.sourceUrl} target="_blank" rel="noreferrer">Open public source record ↗</a>
          <small>{selected.properties.locationAccuracy ? `Location note: ${selected.properties.locationAccuracy}. ` : ""}{selected.properties.holderEvidence ? `Proponent evidence: ${selected.properties.holderEvidence}.` : "Ownership is shown only when a public source can be verified."}</small>
        </article>}
      </div>
    </section>

    <section className="mining-method" id="method">
      <div><span className="mining-eyebrow">ONE MAP · MULTIPLE PUBLIC DATA LENSES</span><h2>Build a clearer picture of cumulative activity.</h2><p>Waniskâ Watch keeps government facts, geographic intersections and research confidence separate. Combine sectors to see overlapping pressures, or isolate one lens for a focused community briefing.</p></div>
      <div className="mining-method-grid">
        <article><b>01</b><strong>Select a territory</strong><p>Use the coloured Manitoba treaty-boundary layer to focus the map and records.</p></article>
        <article><b>02</b><strong>Add sector lenses</strong><p>Combine minerals, water, forestry, energy, pollution, infrastructure and land use.</p></article>
        <article><b>03</b><strong>Identify proponents</strong><p>Review recorded companies, responsible authorities and verified public contacts.</p></article>
        <article><b>04</b><strong>Prepare</strong><p>Export a source-linked record set for leadership, lands and consultation teams.</p></article>
      </div>
      <div className="mining-caution"><span>i</span><p><strong>Important boundary note.</strong> The coloured polygons use Manitoba’s official historic-treaty boundary dataset as a geographic index. They do not determine traditional territory, legal rights, duty-to-consult obligations or the treaty affiliation of a nearby Nation. Community-controlled cultural and land-use information should remain private unless a Nation authorizes publication.</p></div>
      <div className="mining-method-meta"><span>{contacts?.metadata.note || "Only publicly verified business contacts are displayed."}</span><div><a href={treatyDataset?.metadata.sourceUrl} target="_blank" rel="noreferrer">Treaty boundary source ↗</a><a href={sectorDataset?.metadata.sourceUrl} target="_blank" rel="noreferrer">Federal project source ↗</a><a href={miningDataset?.metadata.sourceUrl} target="_blank" rel="noreferrer">Manitoba mining source ↗</a></div></div>
    </section>

    <footer className="mining-footer">
      <div className="mining-footer-primary"><a className="mining-brand" href="/"><WatchLogo /></a><p>Treaty-territory environmental intelligence for informed decisions.</p></div>
      <a className="mining-product-of" href="https://waniskaservices.ca/" target="_blank" rel="noreferrer"><span>A PRODUCT OF</span><img src="/waniska-services-logo.png" alt="Waniskâ Services" /></a>
      <span className="mining-footer-source">Government data · Independent presentation</span>
    </footer>
  </main>;
}
