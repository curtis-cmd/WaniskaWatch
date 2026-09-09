import type * as Leaflet from 'leaflet';
import {currentRecord, detailZoom, geometryBounds, intersects, jsonData, kinds, normalizeRecord} from './map-data';
import type {Box, Collection, Kind, RecordFeature} from './map-data';

type Jurisdiction = {key: string; name: string; verifiedAt: string};
type Options = {
  jurisdictions: Jurisdiction[];
  path: (url: string) => string;
  settings: () => {kinds: Set<Kind>; territories: boolean};
  onRecords: (records: RecordFeature[]) => void;
  onSelect: (record: RecordFeature | null) => void;
  onNote: (note: string) => void;
  onDetailKeys: (keys: Set<string>) => void;
  onGroups: (groups: any[]) => void;
};

export function mountActivityLayers(L: typeof Leaflet, map: Leaflet.Map, options: Options) {
  const layer = L.layerGroup().addTo(map);
  const territories = L.layerGroup().addTo(map);
  map.createPane('nationalTerritories');
  map.getPane('nationalTerritories')!.style.zIndex = '380';
  let request: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const cache = new Map<string, any>();
  const cached = async (file: string, signal: AbortSignal) => {
    if (cache.has(file)) return cache.get(file);
    const value = await jsonData(options.path(file), signal);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    cache.set(file, value);
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
    return value;
  };
  let selected: Leaflet.Path | null = null;
  const style = (feature: RecordFeature) => ({color: kinds[feature.properties.kind as Kind]?.color || '#b87925', weight: 1.4, fillOpacity: .18});
  const show = (record: RecordFeature, shape: Leaflet.Path) => {
    if (selected) selected.setStyle({weight: 1.4, fillOpacity: .18});
    selected = shape; shape.setStyle({weight: 4, fillOpacity: .45}); shape.bringToFront(); options.onSelect(record);
  };
  const render = (records: RecordFeature[]) => {
    const collection: Collection = {type: 'FeatureCollection', features: records};
    L.geoJSON(collection, {
      style: f => style(f as RecordFeature),
      pointToLayer: (f, latlng) => L.circleMarker(latlng, {...style(f as RecordFeature), radius: f.properties.kind === 'mine' ? 7 : 5, fillOpacity: .65}),
      onEachFeature: (f, shape) => {
        const record = f as RecordFeature;
        const label = document.createElement('span');
        label.textContent = `${record.properties.name || record.properties.id} · ${record.properties.kindLabel || record.properties.kind}`;
        shape.bindTooltip(label, {sticky: true});
        shape.on('mouseover', () => (shape as Leaflet.Path).setStyle({weight: 4, fillOpacity: .4}));
        shape.on('mouseout', () => {if (shape !== selected) (shape as Leaflet.Path).setStyle(style(record));});
        shape.on('click', () => show(record, shape as Leaflet.Path));
      },
    }).addTo(layer);
    options.onRecords(records);
  };
  const update = async () => {
    request?.abort(); request = new AbortController();
    const signal = request.signal;
    const timeout = setTimeout(() => request?.signal === signal && request.abort(), 25000);
    layer.clearLayers(); territories.clearLayers(); selected = null;
    options.onSelect(null); options.onRecords([]); options.onDetailKeys(new Set());
    const settings = options.settings();
    const zoom = map.getZoom();
    const b = map.getBounds();
    const bounds: Box = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const notes: string[] = [];
    const complete = new Set<string>();
    try {
      const [index, provinces] = await Promise.all([
        cached('/data/canada-detail-index.json', signal), cached('/data/canada-provinces.json', signal),
      ]);
      if (signal.aborted || stopped) return;
      options.onGroups(index.groups);
      const visible = options.jurisdictions.filter(j => provinces.features.some((f: RecordFeature) => f.properties.key === j.key && intersects(geometryBounds(f.geometry), bounds)));
      if (zoom < 5) notes.push('Grouped activity overview. Zoom closer for individual records.');
      else {
        options.onNote('Loading records for this map view…');
        const matching = index.tiles.filter((t: any) => settings.kinds.has(t.kind) && intersects(t.bounds, bounds));
        // Bound payloads and rendering at every zoom. Dense views stay explicitly partial.
        const tiles = matching.slice(0, 12);
        const records: RecordFeature[] = [];
        const failedKeys = new Set<string>();
        if (matching.length > tiles.length) notes.push('Detailed coverage is partial in this dense view; zoom in to load more.');
        for (let start = 0; start < tiles.length; start += 3) {
          await Promise.all(tiles.slice(start, start + 3).map(async (tile: any) => {
            try {
              const payload = await cached(tile.file, signal) as Collection;
              const jurisdiction = options.jurisdictions.find(j => j.key === tile.province)!;
              records.push(...payload.features.filter(f => intersects(geometryBounds(f.geometry), bounds))
                .map(f => normalizeRecord(f, tile.province, payload.metadata || {}, jurisdiction.verifiedAt)).filter(f => currentRecord(f.properties)));
            } catch { failedKeys.add(`${tile.province}:${tile.kind}`); }
          }));
          if (signal.aborted || stopped) return;
        }
        for (const j of visible) {
          for (const kind of settings.kinds) {
            const key = `${j.key}:${kind}`;
            if (!(kind === 'claim' && detailZoom[j.key]) && !failedKeys.has(key)
              && !matching.some((t: any) => t.province === j.key && t.kind === kind && !tiles.includes(t))) complete.add(key);
          }
        }
        if (failedKeys.size) notes.push('Some snapshot tiles could not load. Summary markers remain; try again or open the provincial view.');
        if (settings.kinds.has('claim')) {
          for (const j of visible.filter(j => detailZoom[j.key] && zoom >= detailZoom[j.key])) {
            if (signal.aborted || stopped) return;
            try {
              let payload: Collection;
              let partial = false;
              if (j.key === 'quebec') {
                const qi = await cached('/data/quebec-claims/index.json', signal);
                const matches = qi.tiles.filter((t: any) => intersects(t.bounds, bounds));
                const features: RecordFeature[] = [];
                partial = matches.length > 4;
                for (const tile of matches.slice(0, 4)) features.push(...(await cached(tile.file, signal)).features);
                payload = {type:'FeatureCollection', features, metadata: qi.metadata};
              } else {
                const params = new URLSearchParams({west:String(bounds[0]),south:String(bounds[1]),east:String(bounds[2]),north:String(bounds[3]),zoom:String(zoom)});
                payload = await jsonData(options.path(`/api/claims/${j.key}?${params}`), signal);
                partial = !!payload.metadata?.truncated;
              }
              const unique = new Map<string, RecordFeature>();
              for (const feature of payload.features) {
                if (!intersects(geometryBounds(feature.geometry), bounds)) continue;
                const f = normalizeRecord(feature, j.key, payload.metadata || {}, j.verifiedAt);
                if (currentRecord(f.properties)) unique.set(String(f.properties.id), f);
              }
              records.push(...[...unique.values()].slice(0, 2000));
              if (partial || unique.size > 2000) notes.push(`${j.name}: partial claim detail; zoom closer. Summary markers remain.`);
              else complete.add(`${j.key}:claim`);
            } catch { notes.push(`${j.name}: claim detail unavailable. Summary markers remain; verify with the official source.`); }
          }
        }
        if (signal.aborted || stopped) return;
        if (records.length > 6000) {notes.push('Showing the first 6,000 loaded records; zoom closer.'); complete.clear();}
        render(records.slice(0, 6000));
        notes.unshift(`${Math.min(records.length, 6000).toLocaleString('en-CA')} individual records loaded at this map view. Remaining circles are grouped summaries, not additional claims.`);
      }
      if (settings.territories) {
        if (zoom < 4) notes.push('Territorial context appears from zoom level 4.');
        else for (const j of visible) {
          try {
            const payload = await cached(`/data/${j.key}-${j.key === 'manitoba' ? 'treaties' : 'territories'}.json`, signal);
            if (signal.aborted || stopped) return;
            L.geoJSON(payload, {pane: 'nationalTerritories', style: f => {
              const name = String(f?.properties?.name || '');
              const hash = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
              return {color: ['#615084','#367066','#ac5d3c','#427f9d','#947428'][hash % 5], weight: 2, dashArray: '6 5', fillOpacity: .04};
            }, onEachFeature: (f, shape) => {
              const text = document.createElement('span');
              text.textContent = `${f.properties?.name || 'Published territorial context'} · ${j.name} · Geographic index, not a rights determination · Boundary source date: ${payload.metadata?.generatedAt || payload.metadata?.retrievedAt || 'See provincial source register'}`;
              shape.bindTooltip(text, {sticky: true});
            }}).addTo(territories);
          } catch { notes.push(`${j.name}: territorial context unavailable; this does not imply absence of rights or treaties.`); }
        }
      }
      if (signal.aborted || stopped) return;
      options.onDetailKeys(complete); options.onNote(notes.join(' '));
    } catch {
      if (!stopped && !signal.aborted) options.onNote('Detail index unavailable. Use the province links; the grouped overview remains available.');
    } finally {
      clearTimeout(timeout);
      if (!stopped && signal.aborted && request?.signal === signal) options.onNote('Loading timed out or was interrupted. Move the map or change a layer to retry; no complete coverage is implied.');
    }
  };
  const schedule = () => {request?.abort(); clearTimeout(timer); timer = setTimeout(() => void update(), 250);};
  const clearSelection = () => {if (selected) selected.setStyle({weight:1.4,fillOpacity:.18}); selected = null; options.onSelect(null);};
  const moving = () => {request?.abort(); clearTimeout(timer); layer.clearLayers(); clearSelection(); options.onRecords([]); options.onDetailKeys(new Set());};
  map.on('movestart', moving);
  map.on('moveend', schedule);
  void update();
  return {refresh: schedule, clearSelection, select: (record: RecordFeature) => {
    layer.eachLayer(group => (group as Leaflet.GeoJSON).eachLayer(shape => {
      const f = (shape as any).feature;
      if (f?.properties.id === record.properties.id && f?.properties.kind === record.properties.kind && f?.properties.province === record.properties.province) show(record, shape as Leaflet.Path);
    }));
  }, destroy: () => {stopped = true; request?.abort(); clearTimeout(timer); map.off('movestart', moving); map.off('moveend', schedule); layer.remove(); territories.remove(); cache.clear();}};
}
