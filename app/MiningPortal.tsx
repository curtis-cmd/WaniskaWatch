"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GeoJSON as LeafletGeoJSON, Map as LeafletMap } from "leaflet";

type Sector = "minerals";
type ActivityKind = "claim" | "exploration" | "lease" | "mine";
type DataStatus = "loading" | "ready" | "error";
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

const mineralKinds: ActivityKind[] = ["claim", "exploration", "lease", "mine"];
const kindMeta: Record<ActivityKind, { label: string; short: string; color: string; marker: string }> = {
  claim: { label: "Mining claims", short: "Claims", color: "#b97b26", marker: "◆" },
  exploration: { label: "Exploration licences", short: "Exploration", color: "#27736b", marker: "●" },
  lease: { label: "Mineral leases", short: "Leases", color: "#76537d", marker: "■" },
  mine: { label: "Mine sites", short: "Mine sites", color: "#b84e36", marker: "▲" },
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const appPath = (path: string) => `${basePath}${path}`;

function WatchLogo() {
  return <img className="watch-logo" src={appPath("/waniska-watch-logo.png")} alt="Waniskâ Watch" />;
}

function readableStatus(status: string | null) {
  if (!status) return "Status not published";
  return status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
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

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function MiningPortal() {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const activityLayer = useRef<LeafletGeoJSON | null>(null);
  const treatyLayer = useRef<LeafletGeoJSON | null>(null);
  const supportDialog = useRef<HTMLDialogElement>(null);
  const [miningDataset, setMiningDataset] = useState<ActivityDataset | null>(null);
  const [treatyDataset, setTreatyDataset] = useState<TreatyDataset | null>(null);
  const [contacts, setContacts] = useState<ContactDirectory | null>(null);
  const [dataStatus, setDataStatus] = useState<DataStatus>("loading");
  const [territory, setTerritory] = useState("All Manitoba");
  const [activeMineralKinds, setActiveMineralKinds] = useState<Set<ActivityKind>>(new Set(mineralKinds));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ActivityFeature | null>(null);
  const [listLimit, setListLimit] = useState(60);
  const [mapReady, setMapReady] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(appPath("/data/manitoba-mining.json")).then(response => {
        if (!response.ok) throw new Error("Mining dataset unavailable");
        return response.json();
      }),
      fetch(appPath("/data/manitoba-treaties.json")).then(response => {
        if (!response.ok) throw new Error("Territory dataset unavailable");
        return response.json();
      }),
      fetch(appPath("/data/proponent-contacts.json")).then(response => {
        if (!response.ok) throw new Error("Contact directory unavailable");
        return response.json();
      }),
    ]).then(([mining, treaties, directory]) => {
      setMiningDataset(mining);
      setTreatyDataset(treaties);
      setContacts(directory);
      setDataStatus("ready");
      if (typeof window !== "undefined") {
        const recordId = new URLSearchParams(window.location.search).get("record");
        const linked = mining.features.find((feature: ActivityFeature) => String(feature.properties.id) === recordId);
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
      setMiningDataset(null);
      setTreatyDataset(null);
      setContacts(null);
      setDataStatus("error");
    });
  }, []);

  const activities = useMemo<ActivityFeature[]>(() => {
    return (miningDataset?.features || []).map(feature => ({
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
  }, [miningDataset]);

  const territoryNames = useMemo(() => {
    const published = treatyDataset?.features.map(feature => feature.properties.name)
      || ["Treaty 1", "Treaty 2", "Treaty 3", "Treaty 4", "Treaty 5"];
    const hasUnassigned = activities.some(feature => feature.properties.treaty === "Unassigned");
    return ["All Manitoba", ...published, ...(hasUnassigned ? ["Unassigned"] : [])];
  }, [activities, treatyDataset]);

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
      if (!activeMineralKinds.has(item.kind)) return false;
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
  }, [activities, territory, activeMineralKinds, query]);

  const mineralCounts = useMemo(() => {
    const counts: Record<ActivityKind, number> = { claim: 0, exploration: 0, lease: 0, mine: 0 };
    activities.forEach(feature => {
      if (territory !== "All Manitoba" && feature.properties.treaty !== territory) return;
      counts[feature.properties.kind]++;
    });
    return counts;
  }, [activities, territory]);

  const selectTerritory = useCallback((nextTerritory: string) => {
    setTerritory(nextTerritory);
    setListLimit(60);
    setSelected(null);
    setCopied(false);
    requestAnimationFrame(() => document.getElementById("territory-watch")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" }));
  }, []);

  const selectFeature = useCallback((feature: ActivityFeature, moveMap = true) => {
    setSelected(feature);
    setCopied(false);
    if (typeof window !== "undefined") {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("record", String(feature.properties.id));
      window.history.replaceState({}, "", nextUrl);
    }
    if (moveMap) {
      mapInstance.current?.flyTo(
        [feature.properties.latitude, feature.properties.longitude],
        feature.geometry.type === "Point" ? 9 : 8,
        { duration: prefersReducedMotion() ? 0 : 0.65 },
      );
    }
  }, []);

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
      }).setView([55.15, -97.2], 5);
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
            dashArray: territory === props.name ? undefined : "5 4",
            weight: territory === props.name ? 4 : 2,
            opacity: highlighted ? 0.95 : 0.25,
            fillColor: props.color,
            fillOpacity: territory === props.name ? 0.2 : highlighted ? 0.07 : 0.015,
          };
        },
        onEachFeature: (feature, layerItem) => {
          const props = feature.properties as TreatyProperties;
          layerItem.bindTooltip(`${props.name} · historic treaty signed ${props.year}`, { sticky: true });
          layerItem.on("click", () => selectTerritory(props.name));
        },
      }).addTo(mapInstance.current);
      layer.bringToBack();
      treatyLayer.current = layer;

      if (territory !== "All Manitoba" && territory !== "Unassigned") {
        const selectedTreaty = treatyDataset.features.find(feature => feature.properties.name === territory);
        if (selectedTreaty) {
          const bounds = L.geoJSON(selectedTreaty).getBounds();
          if (bounds.isValid()) mapInstance.current.fitBounds(bounds.pad(0.04), { maxZoom: 7, animate: !prefersReducedMotion() });
        }
      } else {
        mapInstance.current.setView([55.15, -97.2], 5, { animate: !prefersReducedMotion() });
      }
    });
    return () => { active = false; };
  }, [mapReady, selectTerritory, treatyDataset, territory]);

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
          const color = kindMeta[props.kind].color;
          return { color, weight: 1.2, fillColor: color, fillOpacity: 0.4 };
        },
        pointToLayer: (feature, latlng) => {
          const props = feature.properties as ActivityProperties;
          const color = kindMeta[props.kind].color;
          return L.circleMarker(latlng, { radius: 6, color: "#ffffff", weight: 2, fillColor: color, fillOpacity: 0.96 });
        },
        onEachFeature: (feature, itemLayer) => {
          const props = feature.properties as ActivityProperties;
          itemLayer.on("click", () => selectFeature(feature as ActivityFeature, false));
          itemLayer.bindTooltip(`${kindMeta[props.kind].marker} ${props.name || props.id} — ${props.kindLabel} · ${territoryLabel(props.treaty)}`, { sticky: true });
        },
      }).addTo(mapInstance.current);
      activityLayer.current = layer;
    });
    return () => { active = false; };
  }, [filtered, mapReady, selectFeature]);

  function beginTerritoryWatch() {
    document.getElementById("territory-watch")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
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
  const identifiedProponents = new Set(filtered.map(feature => feature.properties.holder).filter(Boolean)).size;
  const generatedAt = miningDataset?.metadata.generatedAt;
  const updated = formatDate(generatedAt, "Loading");
  const boundaryUpdated = formatDate(treatyDataset?.metadata.generatedAt, "Not available");
  const selectedTerritoryMeta = territoryMeta.get(territory);

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
        <span className="watch-eyebrow">WANISKÂ WATCH · TERRITORY WATCH</span>
        <h1>Start with a place.<br />See what is happening around it.</h1>
        <p>Explore public mining claims, exploration licences, mineral leases and mine sites alongside published territorial context—without treating a mapped boundary as the final word.</p>
        <div className="watch-hero-actions">
          <button type="button" className="watch-primary-button" onClick={beginTerritoryWatch}>Open Territory Watch</button>
          <a href="#trust">Read before using the map</a>
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
          <select value="Manitoba" aria-describedby="coverage-note">
            <option>Manitoba</option>
          </select>
        </label>
        <p id="coverage-note"><strong>Manitoba coverage is live.</strong> Additional provinces and territories will be added only when their public records and territorial context can be documented responsibly.</p>
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
              <small>{item === "All Manitoba" ? activities.length.toLocaleString("en-CA") : (territoryCounts[item] || 0).toLocaleString("en-CA")} records</small>
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
        <p className="watch-future-entry"><b>National entry model:</b> province or territory · Nation or community · treaty or agreement · location · project · company · claim</p>
      </div>
    </section>

    <section className="watch-snapshot" aria-label="Current data coverage">
      <div><span>PUBLIC DATA SNAPSHOT</span><strong>{updated}</strong></div>
      <div><span>VISIBLE RECORDS</span><strong>{filtered.length.toLocaleString("en-CA")}</strong></div>
      <div><span>RECORDED HOLDERS</span><strong>{identifiedProponents.toLocaleString("en-CA")}</strong></div>
      <div><span>CURRENT COVERAGE</span><strong>Manitoba</strong></div>
      <p><i /> Free public resource · no account required</p>
    </section>

    <section className="territory-watch-section" id="territory-watch" aria-labelledby="territory-watch-title">
      <div className="territory-watch-heading">
        <div>
          <span className="watch-eyebrow">TERRITORY WATCH · MANITOBA</span>
          <h2 id="territory-watch-title">{territoryLabel(territory)}</h2>
        </div>
        <div className="territory-watch-context">
          <span>{selectedTerritoryMeta ? `Historic treaty signed ${selectedTerritoryMeta.year}` : territory === "Unassigned" ? "No published polygon match" : "Province-wide view"}</span>
          <b>Geographic index—not a rights determination</b>
        </div>
      </div>

      <div className="territory-watch-workspace">
        <aside className="territory-watch-controls" aria-label="Map filters and accessible record list">
          <div className="watch-filter-section">
            <div className="watch-section-label"><span>FILTER THE VIEW</span><b aria-live="polite">{filtered.length.toLocaleString("en-CA")}</b></div>
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

          <div className="watch-record-list" id="records">
            <div className="watch-section-label"><span>ACCESSIBLE RECORD LIST</span><small>Select to locate</small></div>
            {dataStatus === "loading" && <p className="watch-state-message" role="status">Loading public records…</p>}
            {dataStatus === "error" && <p className="watch-state-message error" role="alert">The public datasets could not be loaded. Please try again or use the official source links below.</p>}
            {dataStatus === "ready" && !filtered.length && <p className="watch-state-message" role="status">No records match this view.</p>}
            {filtered.slice(0, listLimit).map(feature => <button
              key={String(feature.properties.id)}
              type="button"
              className={selected?.properties.id === feature.properties.id ? "active" : ""}
              onClick={() => selectFeature(feature)}
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
          <p className="sr-only" id="map-description">The interactive map is paired with an accessible record list. Treaty polygons are historic government-published geographic indexes and are not legal or consultation determinations.</p>
          <div ref={mapElement} className="territory-watch-map" role="region" aria-label="Map of public Manitoba mining activity" aria-describedby="map-description" />
          <div className="watch-map-legend" aria-label="Map legend">
            <strong>MAP LEGEND</strong>
            {mineralKinds.map(kind => <span key={kind}><i style={{ color: kindMeta[kind].color }} aria-hidden="true">{kindMeta[kind].marker}</i>{kindMeta[kind].short}</span>)}
            <span><i className="boundary-symbol" aria-hidden="true" />Historic treaty boundary</span>
          </div>
          <div className="watch-map-source">Boundary source: {treatyDataset?.metadata.source || "Manitoba Land Initiative"} · retrieved {boundaryUpdated}</div>

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
              <div><dt>Province</dt><dd>Manitoba</dd></div>
              <div><dt>Territorial context</dt><dd>{territoryLabel(selected.properties.treaty)}<small>Geographically indexed</small></dd></div>
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
        <strong>Current Manitoba boundary treatment</strong>
        <p>{treatyDataset?.metadata.boundaryNote || "Government-published historic-treaty polygons are used only as a geographic index. They do not determine rights, traditional territory or duty-to-consult obligations."}</p>
        <span>Future Nation-authorized submissions will require governance rules consistent with Indigenous data sovereignty, including consideration of OCAP® where applicable.</span>
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
          <dl><div><dt>Retrieved</dt><dd>{updated}</dd></div><div><dt>Coverage</dt><dd>{activities.length.toLocaleString("en-CA")} records</dd></div><div><dt>Status</dt><dd>Government source</dd></div></dl>
          <a href={miningDataset?.metadata.sourceUrl} target="_blank" rel="noreferrer">Open mining source ↗</a>
        </article>
        <article>
          <span>TERRITORIAL CONTEXT</span>
          <h3>{treatyDataset?.metadata.source || "Manitoba Land Initiative — Treaty Boundary"}</h3>
          <dl><div><dt>Retrieved</dt><dd>{boundaryUpdated}</dd></div><div><dt>Coverage</dt><dd>{treatyDataset?.features.length || 5} historic treaty areas</dd></div><div><dt>Status</dt><dd>Geographic index</dd></div></dl>
          <a href={treatyDataset?.metadata.sourceUrl} target="_blank" rel="noreferrer">Open boundary source ↗</a>
        </article>
      </div>
    </section>

    <section className="watch-services-band">
      <div><span>COMMUNITY SUPPORT</span><h2>Need a deeper project or territory briefing?</h2><p>Waniskâ Services can support research, project review, consultation readiness, strategic planning and community briefings.</p></div>
      <button type="button" onClick={() => supportDialog.current?.showModal()}>Talk with Waniskâ Services</button>
    </section>

    <footer className="watch-footer">
      <div><a href="#top" aria-label="Waniskâ Watch home"><WatchLogo /></a><p>Public mining intelligence for informed community decisions.</p></div>
      <a className="watch-services-brand" href="https://waniskaservices.ca/" target="_blank" rel="noreferrer">
        <span>A free community resource from</span>
        <img src={appPath("/waniska-services-logo.png")} alt="Waniskâ Services" />
      </a>
      <p>Government data · Independent presentation<br />No account required</p>
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
        <a href="tel:+13062036830">Call 306-203-6830</a>
        <a href="https://waniskaservices.ca/" target="_blank" rel="noreferrer">Visit Waniskâ Services ↗</a>
      </div>
      <small>Do not include confidential cultural, land-use or personal information in an initial inquiry.</small>
    </dialog>
  </main>;
}
