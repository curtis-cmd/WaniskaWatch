"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, GeoJSON, CircleMarker } from "leaflet";
import type { FeatureCollection } from "geojson";
import { kinds, type Kind, type RecordFeature } from './map-data';
import { mountActivityLayers } from './activity-map';
import RecordDetails from './RecordDetails';

type Overview = {
  metadata: { claimCount: number; oldestVerified: string | null; newestVerified: string | null; auditedAt: string; note: string };
  jurisdictions: Array<{ key: string; name: string; count: number; verifiedAt: string; sourceUrl: string }>;
  unavailable: Array<{ name: string; reason: string }>;
  features: Array<{ geometry: { coordinates: number[] }; properties: { province: string; name: string; count: number } }>;
};
const path = (value: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${value}`;
const number = (value: number) => value.toLocaleString("en-CA");
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "Not available";
const overviewPadding = { paddingTopLeft: [18, 18] as [number, number], paddingBottomRight: [82, 104] as [number, number] };

export default function NationalOverview({ data }: { data: Overview }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const outlines = useRef<Map<string, GeoJSON>>(new Map());
  const markers = useRef<Array<{province: string; kind: Kind; marker: CircleMarker; baseRadius: number}>>([]);
  const details = useRef<ReturnType<typeof mountActivityLayers> | null>(null);
  const detailKeys = useRef(new Set<string>());
  const [activeKinds, setActiveKinds] = useState<Set<Kind>>(new Set(['claim', 'lease', 'exploration', 'mine']));
  const [territories, setTerritories] = useState(false);
  const settings = useRef({kinds: activeKinds, territories});
  const [records, setRecords] = useState<RecordFeature[]>([]);
  const [selected, setSelected] = useState<RecordFeature | null>(null);
  const [detailNote, setDetailNote] = useState('Zoom closer to load individual records.');
  const [tileError, setTileError] = useState(false);
  const [focused, setFocused] = useState("");
  const [zoom, setZoom] = useState(3);
  const [fullscreen, setFullscreen] = useState(false);
  const [boundaryError, setBoundaryError] = useState(false);
  const [presentation, setPresentation] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [ready, setReady] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [ageDays, setAgeDays] = useState<number | null>(null);
  const chosen = data.jurisdictions.find(j => j.key === focused);
  function syncGroups() {
    for (const item of markers.current) {
      const visible = settings.current.kinds.has(item.kind) && !detailKeys.current.has(`${item.province}:${item.kind}`);
      if (visible && map.current && !map.current.hasLayer(item.marker)) item.marker.addTo(map.current);
      if (!visible) item.marker.remove();
    }
  }

  useEffect(() => {
    settings.current = {kinds: activeKinds, territories};
    detailKeys.current.clear(); syncGroups(); details.current?.refresh();
  }, [activeKinds, territories]);

  function focusProvince(key: string) {
    setFocused(key);
    if (!key) map.current?.fitBounds([[41.5, -141.1], [83.2, -52]], overviewPadding);
    else {
      const outline = outlines.current.get(key);
      if (outline) map.current?.fitBounds(outline.getBounds(), { padding: [36, 36], maxZoom: 7 });
    }
  }

  useEffect(() => {
    // Selecting a jurisdiction changes orientation, never hides neighbouring activity.
    outlines.current.forEach((outline,key) => outline.setStyle({color: focused === key ? "#174e48" : "#718d88", weight: focused === key ? 2.5 : 1, fill: false}));
  }, [focused, ready]);

  useEffect(() => {
    const update = () => { setFullscreen(document.fullscreenElement === workspace.current); map.current?.invalidateSize(); };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (workspace.current?.requestFullscreen) await workspace.current.requestFullscreen();
      else setCopyMessage("Full screen is not available in this browser. Use Presentation view instead.");
    } catch { setCopyMessage("Full screen is not available here. Use Presentation view instead."); }
  }

  useEffect(() => {
    let stopped = false;
    let observer: ResizeObserver | undefined;
    const boundaryRequest = new AbortController();
    const outlineRegistry = outlines.current;
    const timer = window.setTimeout(() => {
      if (data.metadata.oldestVerified) setAgeDays(Math.floor((Date.now() - Date.parse(data.metadata.oldestVerified)) / 86400000));
      setPresentation(new URLSearchParams(window.location.search).get("presentation") === "1");
    }, 0);
    import("leaflet").then(async L => {
      if (stopped || !element.current) return;
      // Match the provincial street/geographic basemap, with detail loaded by viewport.
      const instance = L.map(element.current, { preferCanvas: true, zoomControl: false, minZoom: 0.5, maxZoom: 18, scrollWheelZoom: true, zoomSnap: 0.25 });
      map.current = instance;
      const basemap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'Map © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19, minZoom: 0,
      }).addTo(instance);
      basemap.on('tileerror', () => {if (!stopped) setTileError(true);});
      const fit = () => instance.fitBounds([[41.5, -141.1], [83.2, -52]], { ...overviewPadding, animate: false });
      instance.attributionControl.addAttribution('<a href="https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer/0">Statistics Canada · 2021 boundaries</a>');
      L.control.scale({imperial:false, position:"bottomright"}).addTo(instance);
      instance.createPane("provinceOutlines");
      instance.getPane("provinceOutlines")!.style.zIndex = "390";
      const markerScale = () => Math.min(1, 2 ** (instance.getZoom() - 2.5));
      instance.on("zoomend", () => {
        if (!stopped) {
          setZoom(instance.getZoom());
          for (const {marker, baseRadius} of markers.current) marker.setRadius(baseRadius * markerScale());
        }
      });
      fit();
      observer = new ResizeObserver(() => instance.invalidateSize({pan: false}));
      observer.observe(element.current);
      const boundaryTimeout = window.setTimeout(() => boundaryRequest.abort(), 20000);
      try {
        const response = await fetch(path("/data/canada-provinces.json"), {signal: boundaryRequest.signal});
        if (!response.ok) throw new Error("Province outlines unavailable");
        const boundaries = await response.json() as FeatureCollection;
        if (stopped) return;
        for (const feature of boundaries.features) {
          const key = String(feature.properties?.key ?? "");
          const layer = L.geoJSON(feature, {pane:"provinceOutlines",style:{color:"#718d88",weight:1,fill:false}}).addTo(instance);
          const label = document.createElement("span");
          label.textContent = String(feature.properties?.name ?? key);
          layer.bindTooltip(label, {sticky:true});
          layer.on("click", () => {
            if (data.jurisdictions.some(j => j.key === key)) {
              setFocused(key); instance.fitBounds(layer.getBounds(), {padding:[36,36], maxZoom:7});
            } else setCopyMessage(`${label.textContent}: claim coverage is not confirmed, not a verified zero.`);
          });
          outlineRegistry.set(key, layer);
        }
      } catch { if (!stopped) setBoundaryError(true); }
      finally { window.clearTimeout(boundaryTimeout); }
      if (stopped) return;
      const addGroups = (features: any[]) => {for (const feature of features) {
        const { count, name, province } = feature.properties;
        const kind = (feature.properties.kind || 'claim') as Kind;
        const [longitude, latitude] = feature.geometry.coordinates;
        const label = document.createElement("span");
        label.textContent = `${name}: ${number(count)} ${kinds[kind].label.toLowerCase()} in this group`;
        const content = document.createElement("div");
        const heading = document.createElement("strong");
        heading.textContent = `${number(count)} ${kinds[kind].label.toLowerCase()} in this group`;
        const detail = document.createElement("p");
        detail.textContent = `${name} · Approximate locations, not claim boundaries.`;
        const link = document.createElement("a");
        link.href = path(`/?province=${encodeURIComponent(province)}#territory-watch`);
        link.textContent = `Explore ${name} records →`;
        const closer = document.createElement('button');
        closer.type = 'button'; closer.textContent = 'Zoom to this area';
        closer.onclick = () => {instance.closePopup(); instance.setView([latitude, longitude], Math.min(18, instance.getZoom() + 2));};
        content.append(heading, detail, closer, document.createElement('br'), link);
        const baseRadius = Math.min(9, 1.8 + Math.log10(count + 1) * 1.8);
        const marker = L.circleMarker([latitude, longitude], {
          radius: baseRadius * markerScale(),
          color: kinds[kind].color, weight: 0.6, fillColor: kinds[kind].color, fillOpacity: 0.85,
        }).bindTooltip(label).bindPopup(content).addTo(instance);
        marker.on("click", () => setFocused(province));
        markers.current.push({province, kind, marker, baseRadius});
      } syncGroups();};
      addGroups(data.features);
      let activityGroupsAdded = false;
      details.current = mountActivityLayers(L, instance, {
        jurisdictions: data.jurisdictions, path,
        settings: () => settings.current,
        onRecords: setRecords, onSelect: setSelected, onNote: setDetailNote,
        onDetailKeys: keys => {detailKeys.current = keys; syncGroups();},
        onGroups: groups => {if (!activityGroupsAdded) {activityGroupsAdded = true; addGroups(groups);}},
      });
      fit();
      setReady(true);
    }).catch(() => { if (!stopped) setMapError(true); });
    return () => { stopped = true; boundaryRequest.abort(); window.clearTimeout(timer); observer?.disconnect(); details.current?.destroy(); details.current = null; map.current?.remove(); map.current = null; outlineRegistry.clear(); markers.current = []; };
  }, [data]);

  async function copyLink() {
    const url = new URL(path("/canada"), window.location.origin);
    if (presentation) url.searchParams.set("presentation", "1");
    try { await navigator.clipboard.writeText(url.toString()); setCopyMessage("Map link copied"); }
    catch { setCopyMessage("Copy this page’s address from your browser to share it."); }
  }

  return <main className={`national-page${presentation ? " national-presentation" : ""}`}>
    <header className="watch-header">
      <a className="watch-brand" href={path("/")} aria-label="Waniskâ Watch home"><img className="watch-logo" src={path("/waniska-watch-header.png")} alt="Waniskâ Watch" /></a>
      <nav aria-label="Waniskâ Watch navigation"><a href={path("/")}>Province & territory maps</a><a href="#national-sources">Sources & coverage</a></nav>
      <a className="watch-support-button" href="mailto:info@waniskaservices.ca">Get support</a>
    </header>
    <div className="national-toolbar">
      <a href={path("/#territory-watch")}>← Explore individual records</a>
      <div><button type="button" aria-pressed={presentation} onClick={() => setPresentation(value => !value)}>{presentation ? "Exit presentation view" : "Presentation view"}</button><button type="button" onClick={copyLink}>Copy map link</button></div>
      <span role="status">{copyMessage}</span>
    </div>
    <section className="national-sheet" aria-labelledby="national-title">
      <div className="national-heading">
        <div><span className="watch-eyebrow">WANISKÂ WATCH / CANADA-WIDE OVERVIEW</span><h1 id="national-title">Explore the land. Start here.</h1><p>Select a province or territory to begin.</p></div>
        <div className="national-total"><strong>{number(data.metadata.claimCount)}</strong><span>claims in published snapshots</span><small>{data.jurisdictions.length} provinces and territories represented</small></div>
      </div>
      <div className="national-workspace" ref={workspace}>
        <aside className="national-picker" aria-label="Choose a province or territory">
          <span className="watch-eyebrow">FIND YOUR PLACE</span>
          <label htmlFor="national-province">Province or territory</label>
          <select id="national-province" value={focused} onChange={event => focusProvince(event.target.value)}>
            <option value="">Canada · All available claims</option>
            {data.jurisdictions.map(j => <option key={j.key} value={j.key}>{j.name}</option>)}
          </select>
          <div className="national-selection" aria-live="polite">
            <h2>{chosen?.name ?? "Canada"}</h2>
            <strong>{number(chosen?.count ?? data.metadata.claimCount)}</strong><span>claims in published snapshots</span>
            <p>Verified as of {date(chosen?.verifiedAt ?? data.metadata.oldestVerified)}. Not real-time.</p>
            {chosen ? <a className="national-open-records" href={path(`/?province=${chosen.key}#territory-watch`)}>Explore {chosen.name} records →</a> : <p>Choose an area above or select an outline on the map. Then open its detailed records.</p>}
          </div>
          <fieldset className="national-layers"><legend>Map layers</legend>{(Object.keys(kinds) as Kind[]).map(kind => <label key={kind}><input type="checkbox" checked={activeKinds.has(kind)} onChange={() => setActiveKinds(previous => {const next = new Set(previous); if (next.has(kind)) next.delete(kind); else next.add(kind); return next;})} /><span style={{color:kinds[kind].color}} aria-hidden="true">{kinds[kind].symbol}</span>{kinds[kind].label}</label>)}<label><input type="checkbox" checked={territories} onChange={e => setTerritories(e.target.checked)} />Treaties & agreements</label></fieldset>
          <p className="national-detail-note" role="status">{detailNote}</p>
          {territories && <p className="national-detail-note">Published geographic indexes only. Boundaries may overlap; blank areas do not mean absence of Indigenous rights. Source dates appear in boundary tooltips and provincial source registers.</p>}
          <details className="national-quick-list"><summary>Browse all provinces & territories</summary>{data.jurisdictions.map(j => <a key={j.key} href={path(`/?province=${j.key}#territory-watch`)}>{j.name}<span>→</span></a>)}</details>
          <details className="national-record-list"><summary>Loaded records ({number(records.length)})</summary>{records.slice(0, 40).map((record, i) => <button type="button" key={`${record.properties.province}-${record.properties.id}-${i}`} onClick={() => details.current?.select(record)}>{record.properties.name || record.properties.id}<small>{record.properties.province} · {record.properties.kindLabel || record.properties.kind}</small></button>)}{records.length > 40 && <p>First 40 listed. Zoom closer or open the provincial records to explore more.</p>}</details>
          <div className="national-picker-note"><b>Claims are not operating mines.</b><p>Grouped locations are for orientation. Zoom closer for individual records; select one for its source and verification date.</p></div>
        </aside>
        <div className="national-map-wrap">
        <div ref={element} className="national-map" role="region" aria-label="Canada-wide map of public mining activity" aria-describedby="national-map-key" />
        {!ready && !mapError && <p className="national-map-message" role="status">Loading the Canada-wide map…</p>}
        {mapError && <p className="national-map-message" role="alert">The background map could not fully load. Locations may lack geographic context; use the province links below or reload this page.</p>}
        {boundaryError && <p className="national-boundary-warning" role="status">Province outlines unavailable. Use the province chooser.</p>}
        {tileError && <p className="national-boundary-warning" role="status">Some background tiles could not load. Mining layers may lack geographic context; reload to retry.</p>}
        {selected && <RecordDetails record={selected} provinceName={data.jurisdictions.find(j => j.key === selected.properties.province)?.name || selected.properties.province} path={path} onClose={() => details.current?.clearSelection()} />}
        <div className="national-map-key" id="national-map-key"><span aria-hidden="true">●</span> Groups & individual records · select to identify<br /><small>Zoom for available shapes · verified as of {date(data.metadata.oldestVerified)}</small></div>
        <div className="national-navigation" role="group" aria-label="Canada map navigation">
          <button type="button" aria-label="Zoom in" disabled={!ready || zoom >= 18} onClick={() => map.current?.zoomIn()}>+</button>
          <label><span className="sr-only">Map zoom level</span><input type="range" min="0.5" max="18" step="0.25" value={zoom} disabled={!ready} onChange={event => map.current?.setZoom(Number(event.target.value))} /></label>
          <button type="button" aria-label="Zoom out" disabled={!ready || zoom <= 0.5} onClick={() => map.current?.zoomOut()}>−</button>
          <button type="button" disabled={!ready} onClick={() => focusProvince("")} aria-label="Reset to all Canada">↺<span>Canada</span></button>
          <button type="button" disabled={!ready} onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen map"}>⛶<span>{fullscreen ? "Exit" : "Expand"}</span></button>
        </div>
        </div>
      </div>
      <div className="national-caption">
        <span><b>Verified as of {date(data.metadata.oldestVerified)}{data.metadata.oldestVerified?.slice(0, 10) !== data.metadata.newestVerified?.slice(0, 10) ? ` – ${date(data.metadata.newestVerified)}` : ""}.</b> Not real-time. {ageDays !== null && ageDays > 7 ? `Oldest snapshot is ${ageDays} days old; re-verification is needed.` : "Verify current status with the responsible authority."}</span>
        <span>Headline totals count claims only. Leases, exploration and operating mines are separate optional layers.<br /><b>Not complete national coverage.</b> Not represented: {data.unavailable.map(j => j.name).join(", ")}. Blank areas do not establish that no claims exist.</span>
      </div>
      <div className="national-brandline"><span>See the activity. Know the territory.</span><span>app.waniskaservices.ca/watch · A free resource from Waniskâ Services</span></div>
    </section>
    <section id="national-sources" className="national-sources" aria-labelledby="national-sources-title">
      <div><span className="watch-eyebrow">FROM OVERVIEW TO INDIVIDUAL RECORDS</span><h2 id="national-sources-title">Choose a province or territory.</h2><p>Circles summarize claim locations from the published snapshots; their size is not land area. Open a jurisdiction to explore records, holders and available claim boundaries.</p></div>
      <div className="national-jurisdictions">{data.jurisdictions.map(j => <article key={j.key}><a href={path(`/?province=${encodeURIComponent(j.key)}#territory-watch`)}><strong>{j.name} <span aria-hidden="true">↗</span></strong><b>{number(j.count)} claims</b></a><span>Verified as of {date(j.verifiedAt)}</span><a className="national-source-link" href={j.sourceUrl} target="_blank" rel="noopener noreferrer">Government source ↗</a></article>)}</div>
      <aside className="national-unavailable"><h3>Not represented in this overview</h3>{data.unavailable.map(j => <p key={j.name}><b>{j.name}:</b> {j.reason}.</p>)}</aside>
      <p className="national-information">Public information only. A claim is not an operating mine, approval, consultation or consent. This overview does not determine Indigenous rights, title or territorial boundaries. Records are verified as of their displayed dates, not guaranteed real-time or individually confirmed against every registry entry. Verify information with the responsible authority before acting. <a href={path("/#legal-notice")}>Read the full information notice.</a></p>
      <a href={path("/data/canada-claims-overview.json")} target="_blank" rel="noopener noreferrer">View the national overview data and source dates ↗</a>
    </section>
  </main>;
}
