import { readFile, writeFile } from "node:fs/promises";
const keys = {10:"newfoundland-and-labrador",11:"prince-edward-island",12:"nova-scotia",13:"new-brunswick",24:"quebec",35:"ontario",46:"manitoba",47:"saskatchewan",48:"alberta",59:"british-columbia",60:"yukon",61:"northwest-territories",62:"nunavut"};
const input = JSON.parse(await readFile(process.argv[2], "utf8"));
if (input.features?.length !== 13) throw new Error("Expected 13 official province/territory outlines");
const area = ring => Math.abs(ring.reduce((s, p, i) => {const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
const features = input.features.map(f => {
  const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  // Omit collapsed/tiny islands created by source generalization, never invent shapes.
  const coordinates = polygons.filter(p => area(p[0]) > 0.001).map(p => p.filter((r,i)=>i===0||area(r)>0.001));
  if (!coordinates.length || !keys[f.properties.PRUID]) throw new Error("Missing province geometry");
  return {type:"Feature",properties:{key:keys[f.properties.PRUID],name:f.properties.PRENAME},geometry:{type:"MultiPolygon",coordinates}};
});
const result={type:"FeatureCollection",metadata:{source:"Statistics Canada — 2021 Census cartographic boundaries",sourceUrl:"https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer/0",retrievedAt:new Date().toISOString(),note:"Generalized provincial geography for navigation only; not treaty, rights or claim boundaries. Small islands omitted at this scale."},features};
await writeFile(new URL("../public/data/canada-provinces.json",import.meta.url),JSON.stringify(result));
console.log(`Prepared ${features.length} generalized province and territory outlines.`);
