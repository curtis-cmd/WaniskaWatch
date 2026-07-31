#!/usr/bin/env python3
"""Build treaty-boundary and cross-sector public-project layers for Waniskâ Watch."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

VENDOR = Path(__file__).with_name("vendor")
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

import shapefile  # type: ignore
from pyproj import Transformer  # type: ignore
from shapely.geometry import mapping, shape  # type: ignore
from shapely.ops import transform  # type: ignore
from shapely.validation import make_valid  # type: ignore

IAAC_QUERY = (
    "https://maps-cartes.services.geo.ca/server_serveur/rest/services/"
    "IAAC/assessment_inventory_en/MapServer/0/query"
)
TREATY_SOURCE = "https://mli.gov.mb.ca/adminbnd/meta_files/treaty_boundary_metadata.htm"
TREATY_COLORS = {
    "Treaty 1": "#cc6b4a",
    "Treaty 2": "#d49a3a",
    "Treaty 3": "#6f8f4e",
    "Treaty 4": "#7a63a8",
    "Treaty 5": "#2f7f85",
    "Treaty 6": "#4779a6",
    "Treaty 10": "#a15d7d",
}
SECTOR_MAP = {
    "Mining Industry": ("minerals", "Minerals"),
    "Petroleum Industry": ("energy", "Energy"),
    "Energy": ("energy", "Energy"),
    "Water Management": ("water", "Water"),
    "Waste Management": ("pollution", "Pollution & waste"),
    "Environmental Management": ("pollution", "Pollution & waste"),
    "Transport Industry": ("infrastructure", "Infrastructure"),
    "Construction": ("infrastructure", "Infrastructure"),
    "Forestry Industry": ("forestry", "Forestry"),
    "Agriculture": ("agriculture", "Agriculture"),
    "Tourism": ("land-use", "Land use"),
}
PROPONENT_CONTACTS = [
    {
        "match": "Hudbay",
        "name": "Hudbay Minerals — Capital Markets & Corporate Affairs",
        "email": "investor.relations@hudbay.com",
        "phone": "416-362-8181",
        "website": "https://hudbay.com/contact-us/default.aspx",
        "source": "https://hudbay.com/news-media/default.aspx",
    },
    {
        "match": "1911 Gold",
        "name": "1911 Gold Corporation — Investor Relations",
        "email": "ir@1911gold.com",
        "phone": "604-900-5620",
        "website": "https://1911gold.com/contact/details/",
        "source": "https://1911gold.com/contact/details/",
    },
    {
        "match": "Alamos Gold",
        "name": "Alamos Gold — Main Office",
        "email": "info@alamosgold.com",
        "phone": "416-368-9932",
        "website": "https://www.alamosgold.com/contact/default.aspx",
        "source": "https://www.alamosgold.com/contact/default.aspx",
    },
    {
        "match": "Grid Metals",
        "name": "Grid Metals Corp. — Head Office",
        "email": "info@gridmetalscorp.com",
        "phone": "416-955-4773",
        "website": "https://gridmetalscorp.com/contact/contact-us/",
        "source": "https://gridmetalscorp.com/contact/contact-us/",
    },
]
PROVINCIAL_PROJECTS = [
    {
        "id": "MB-FML-2",
        "name": "Forest Management Licence #2",
        "sector": "forestry",
        "sectorLabel": "Forestry",
        "holder": "Canadian Kraft Paper Industries Ltd.",
        "status": "Current licence",
        "longitude": -101.2541,
        "latitude": 53.8253,
        "location": "The Pas licence area (representative location)",
        "description": (
            "Provincial forest management licence supplying timber to the kraft paper mill "
            "in The Pas. Consult the management plan and registry documents for the licence footprint."
        ),
        "sourceUrl": "https://www.gov.mb.ca/nrnd/forest/forestry/forest-mgmt-and-plan/index.html",
    },
    {
        "id": "MB-FML-3",
        "name": "Forest Management Licence #3",
        "sector": "forestry",
        "sectorLabel": "Forestry",
        "holder": "LP Canada Ltd.",
        "status": "Current licence",
        "longitude": -101.2607,
        "latitude": 52.0872,
        "location": "Minitonas licence area (representative location)",
        "description": (
            "Provincial forest management licence supplying timber to the oriented strand board "
            "mill in Minitonas. Consult the management plan and registry documents for the licence footprint."
        ),
        "sourceUrl": "https://www.gov.mb.ca/nrnd/forest/forestry/forest-mgmt-and-plan/index.html",
    },
]


def round_coordinates(value, digits=5):
    if isinstance(value, (list, tuple)):
        if value and isinstance(value[0], (int, float)):
            return [round(number, digits) for number in value]
        return [round_coordinates(item, digits) for item in value]
    return value


def load_treaties(raw_dir: Path):
    reader = shapefile.Reader(str(raw_dir / "treaty_boundary" / "treaty.shp"))
    to_wgs84 = Transformer.from_crs("EPSG:26914", "EPSG:4326", always_xy=True)
    treaties = []
    for item in reader.iterShapeRecords():
        attrs = item.record.as_dict()
        utm_geometry = make_valid(shape(item.shape.__geo_interface__))
        wgs_geometry = transform(to_wgs84.transform, utm_geometry)
        treaties.append(
            {
                "name": attrs["TREATY_NAM"].strip(),
                "year": attrs["TREATY_YEA"].strip(),
                "description": attrs["DESCRIPTIO"].strip(),
                "geometry": wgs_geometry,
            }
        )
    return treaties


def find_treaty(point, treaties):
    for treaty in treaties:
        if treaty["geometry"].covers(point):
            return treaty["name"]
    return "Unassigned"


def contact_for(proponent: str | None):
    if not proponent:
        return None
    for contact in PROPONENT_CONTACTS:
        if contact["match"].lower() in proponent.lower():
            return {key: value for key, value in contact.items() if key != "match"}
    return None


def fetch_iaac():
    parameters = {
        "where": "province_codes LIKE '%MB%'",
        "outFields": "*",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "geojson",
    }
    url = f"{IAAC_QUERY}?{urllib.parse.urlencode(parameters)}"
    request = urllib.request.Request(url, headers={"User-Agent": "Waniska-Watch/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.loads(response.read())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, default=Path("data/manitoba-mining/raw"))
    parser.add_argument("--iaac-input", type=Path)
    parser.add_argument("--treaty-output", type=Path, default=Path("public/data/manitoba-treaties.json"))
    parser.add_argument("--sector-output", type=Path, default=Path("public/data/manitoba-sectors.json"))
    args = parser.parse_args()

    treaties = load_treaties(args.raw_dir)
    treaty_features = []
    for treaty in treaties:
        geometry = treaty["geometry"].simplify(0.004, preserve_topology=True)
        mapped = mapping(geometry)
        mapped["coordinates"] = round_coordinates(mapped["coordinates"])
        treaty_features.append(
            {
                "type": "Feature",
                "id": treaty["name"],
                "geometry": mapped,
                "properties": {
                    "name": treaty["name"],
                    "year": treaty["year"],
                    "description": treaty["description"],
                    "color": TREATY_COLORS.get(treaty["name"], "#657b76"),
                    "sourceUrl": TREATY_SOURCE,
                },
            }
        )

    treaty_payload = {
        "type": "FeatureCollection",
        "metadata": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "source": "Manitoba Land Initiative — Treaty Boundary",
            "sourceUrl": TREATY_SOURCE,
            "boundaryNote": (
                "Official provincial historic-treaty boundary dataset used as a geographic index. "
                "It is not a determination of traditional territory, rights, or consultation obligations."
            ),
        },
        "features": treaty_features,
    }
    args.treaty_output.parent.mkdir(parents=True, exist_ok=True)
    args.treaty_output.write_text(
        json.dumps(treaty_payload, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )

    iaac = json.loads(args.iaac_input.read_text()) if args.iaac_input else fetch_iaac()
    sector_features = []
    for feature in iaac.get("features", []):
        props = feature.get("properties") or {}
        geometry = shape(feature["geometry"])
        point = geometry if geometry.geom_type == "Point" else geometry.centroid
        category = props.get("project_cat_en") or "Other"
        sector, sector_label = SECTOR_MAP.get(category, ("land-use", "Land use"))
        proponent = props.get("proponent_en")
        project_id = str(props.get("project_id") or props.get("OBJECTID"))
        sector_features.append(
            {
                "type": "Feature",
                "id": f"iaac:{project_id}",
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(point.x, 5), round(point.y, 5)],
                },
                "properties": {
                    "id": project_id,
                    "name": props.get("project_name_en") or project_id,
                    "kind": "assessment",
                    "kindLabel": "Public impact-assessment record",
                    "sector": sector,
                    "sectorLabel": sector_label,
                    "status": props.get("project_state_en"),
                    "treaty": find_treaty(point, treaties),
                    "areaHa": None,
                    "commodity": None,
                    "holder": proponent,
                    "holderEvidence": "Canadian Impact Assessment Registry",
                    "issueDate": props.get("start_date"),
                    "expiryDate": None,
                    "longitude": round(point.x, 5),
                    "latitude": round(point.y, 5),
                    "responsibleAuthority": props.get("responsible_authority_en"),
                    "location": props.get("location_en"),
                    "description": (props.get("description_en") or "").strip()[:700] or None,
                    "sourceUrl": props.get("project_url_en"),
                    "sourceName": "Canadian Impact Assessment Registry",
                    "lastUpdated": props.get("updated_at"),
                    "locationAccuracy": props.get("location_type_en"),
                    "contact": contact_for(proponent),
                },
            }
        )

    for project in PROVINCIAL_PROJECTS:
        point = shape(
            {
                "type": "Point",
                "coordinates": [project["longitude"], project["latitude"]],
            }
        )
        sector_features.append(
            {
                "type": "Feature",
                "id": f"province:{project['id']}",
                "geometry": mapping(point),
                "properties": {
                    **project,
                    "kind": "licence",
                    "kindLabel": "Forest management licence",
                    "treaty": find_treaty(point, treaties),
                    "areaHa": None,
                    "commodity": None,
                    "holderEvidence": "Government of Manitoba forest management and planning registry",
                    "issueDate": None,
                    "expiryDate": None,
                    "responsibleAuthority": "Manitoba Natural Resources and Indigenous Futures",
                    "sourceName": "Government of Manitoba",
                    "lastUpdated": None,
                    "locationAccuracy": "Representative location; consult source for licence footprint",
                    "contact": None,
                },
            }
        )

    counts = Counter(feature["properties"]["sector"] for feature in sector_features)
    sector_payload = {
        "type": "FeatureCollection",
        "metadata": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "source": "Impact Assessment Agency of Canada — Assessment Inventory",
            "sourceUrl": (
                "https://open.canada.ca/data/en/dataset/"
                "f4c51eaa-a6ca-48b9-a1fc-b0651da20509"
            ),
            "featureCount": len(sector_features),
            "counts": counts,
            "locationNote": (
                "Federal registry locations are approximate and do not represent full project footprints."
            ),
        },
        "features": sector_features,
    }
    args.sector_output.write_text(
        json.dumps(sector_payload, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    print(
        f"Wrote {len(treaty_features)} treaty boundaries and "
        f"{len(sector_features)} public project records"
    )


if __name__ == "__main__":
    main()
