"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";

type Overview = {
  metadata: { claimCount: number; oldestVerified: string | null; newestVerified: string | null; auditedAt: string; note: string };
  jurisdictions: Array<{ key: string; name: string; count: number; verifiedAt: string; sourceUrl: string }>;
  unavailable: Array<{ name: string; reason: string }>;
  features: Array<{ geometry: { coordinates: number[] }; properties: { province: string; name: string; count: number } }>;
};
const path = (value: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${value}`;
const number = (value: number) => value.toLocaleString("en-CA");
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "Not available";

export default function NationalOverview({ data }: { data: Overview }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const [presentation, setPresentation] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [ready, setReady] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [ageDays, setAgeDays] = useState<number | null>(null);

  useEffect(() => {
    let stopped = false;
    let observer: ResizeObserver | undefined;
    const timer = window.setTimeout(() => {
      if (data.metadata.oldestVerified) setAgeDays(Math.floor((Date.now() - Date.parse(data.metadata.oldestVerified)) / 86400000));
      setPresentation(new URLSearchParams(window.location.search).get("presentation") === "1");
    }, 0);
    import("leaflet").then(L => {
      if (stopped || !element.current) return;
      const instance = L.map(element.current, { preferCanvas: true, minZoom: 2, maxZoom: 10, scrollWheelZoom: false, zoomSnap: 0.25 });
      map.current = instance;
      const fit = () => instance.fitBounds([[41.5, -141], [83.2, -52]], { padding: [18, 18], animate: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: 'Map © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).on("tileerror", () => { if (!stopped) setMapError(true); }).addTo(instance);
      for (const feature of data.features) {
        const { count, name, province } = feature.properties;
        const [longitude, latitude] = feature.geometry.coordinates;
        const label = document.createElement("span");
        label.textContent = `${name}: ${number(count)} claims in this group`;
        const content = document.createElement("div");
        const heading = document.createElement("strong");
        heading.textContent = `${number(count)} published claims`;
        const detail = document.createElement("p");
        detail.textContent = `${name} · Approximate locations, not claim boundaries.`;
        const link = document.createElement("a");
        link.href = path(`/?province=${encodeURIComponent(province)}#territory-watch`);
        link.textContent = `Explore ${name} records →`;
        content.append(heading, detail, link);
        L.circleMarker([latitude, longitude], {
          radius: Math.min(18, 2.5 + Math.sqrt(count) * 0.14),
          color: "#624023", weight: 0.7, fillColor: "#ce913d", fillOpacity: 0.76,
        }).bindTooltip(label).bindPopup(content).addTo(instance);
      }
      fit();
      observer = new ResizeObserver(() => { instance.invalidateSize(); fit(); });
      observer.observe(element.current);
      setReady(true);
    }).catch(() => { if (!stopped) setMapError(true); });
    return () => { stopped = true; window.clearTimeout(timer); observer?.disconnect(); map.current?.remove(); map.current = null; };
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
        <div><span className="watch-eyebrow">WANISKÂ WATCH / CANADA-WIDE OVERVIEW</span><h1 id="national-title">The bigger picture.</h1><p>Published mining claims across Canada.</p></div>
        <div className="national-total"><strong>{number(data.metadata.claimCount)}</strong><span>claims in published snapshots</span><small>{data.jurisdictions.length} provinces and territories represented</small></div>
      </div>
      <div className="national-map-wrap">
        <div ref={element} className="national-map" role="region" aria-label="Canada-wide map of grouped published mining claims" aria-describedby="national-map-key" />
        {!ready && !mapError && <p className="national-map-message" role="status">Loading the Canada-wide map…</p>}
        {mapError && <p className="national-map-message" role="alert">The background map could not fully load. Locations may lack geographic context; use the province links below or reload this page.</p>}
        <div className="national-map-key" id="national-map-key"><span aria-hidden="true">●</span> Larger circles = more claims<br /><small>Grouped locations—not claim boundaries</small></div>
        <button className="national-reset" type="button" disabled={!ready} onClick={() => map.current?.fitBounds([[41.5, -141], [83.2, -52]], { padding: [18, 18] })}>Show all Canada</button>
      </div>
      <div className="national-caption">
        <span><b>Verified as of {date(data.metadata.oldestVerified)}{data.metadata.oldestVerified?.slice(0, 10) !== data.metadata.newestVerified?.slice(0, 10) ? ` – ${date(data.metadata.newestVerified)}` : ""}.</b> Not real-time. {ageDays !== null && ageDays > 7 ? `Oldest snapshot is ${ageDays} days old; re-verification is needed.` : "Verify current status with the responsible authority."}</span>
        <span>Claims only · Leases, exploration licences and mines are separate record types.<br /><b>Not complete national coverage.</b> Not represented: {data.unavailable.map(j => j.name).join(", ")}. Blank areas do not establish that no claims exist.</span>
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
