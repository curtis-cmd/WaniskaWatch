"""Authoritative public-source configuration for Waniskâ Watch."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Layer:
    slug: str
    source_name: str
    source_url: str
    layer_id: int
    category: str
    record_type: str
    where: str = "1=1"
    external_id: str = "OBJECTID"
    name: str | None = None
    status: str | None = None
    holder: str | None = None
    commodity: str | None = None
    issue_date: str | None = None
    expiry_date: str | None = None
    area: str | None = None
    area_divisor: float = 1.0
    location: str | None = None
    source_link: str | None = None

    @property
    def endpoint(self) -> str:
        return f"{self.source_url}/{self.layer_id}"


STATCAN_PROVINCES = (
    "Statistics Canada 2021 Census Cartographic Boundary Files",
    "https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer",
    0,
)

HISTORIC_TREATIES = (
    "Crown-Indigenous Relations and Northern Affairs Canada — Historic Treaties",
    "https://geo.sac-isc.gc.ca/geomatics/rest/services/"
    "Donnees_Ouvertes-Open_Data/Historic_Treaty_E/MapServer",
    0,
)

SASKATCHEWAN_TREATIES = (
    "Government of Saskatchewan — First Nation Treaty Boundaries",
    "https://gis.saskatchewan.ca/arcgis/rest/services/AboriginalLands/MapServer",
    2,
)

PROVINCES = {
    "saskatchewan": {
        "name": "Saskatchewan",
        "abbreviation": "SK",
        "pruid": "47",
        "territory_source": SASKATCHEWAN_TREATIES,
        "territory_name_field": "TREATY_NAM",
        "territory_alt_field": "TREATY_N_1",
        "layers": [
            Layer(
                slug="mineral_dispositions",
                source_name="Government of Saskatchewan MARS — Mineral Dispositions",
                source_url="https://gis.saskatchewan.ca/arcgis/rest/services/"
                "Economy/Mineral_Tenure_Crown_Dispositions/MapServer",
                layer_id=0,
                category="claim",
                record_type="Crown mineral disposition",
                external_id="DISPOSIT_1",
                name="DISPOSIT_1",
                status="DISPOSIT_3",
                holder="OWNERS",
                issue_date="EFFECTIVED",
                expiry_date="GOODSTANDI",
                area="SHAPE.AREA",
                area_divisor=10_000,
            ),
            Layer(
                slug="assessment_underground",
                source_name="Saskatchewan Geological Survey — Underground Assessment Files",
                source_url="https://gis.saskatchewan.ca/arcgis/rest/services/"
                "Economy/P_Mineral_Assessment_File_Information/MapServer",
                layer_id=1,
                category="exploration",
                record_type="Underground assessment file",
                external_id="FILENUMBER",
                name="AREA_",
                holder="COMPANY",
                issue_date="WORK_DATE",
            ),
            Layer(
                slug="assessment_ground",
                source_name="Saskatchewan Geological Survey — Ground Assessment Files",
                source_url="https://gis.saskatchewan.ca/arcgis/rest/services/"
                "Economy/P_Mineral_Assessment_File_Information/MapServer",
                layer_id=2,
                category="exploration",
                record_type="Ground assessment file",
                external_id="FILENUMBER",
                name="AREA_",
                holder="COMPANY",
                issue_date="WORK_DATE",
            ),
            Layer(
                slug="assessment_airborne",
                source_name="Saskatchewan Geological Survey — Airborne Assessment Files",
                source_url="https://gis.saskatchewan.ca/arcgis/rest/services/"
                "Economy/P_Mineral_Assessment_File_Information/MapServer",
                layer_id=3,
                category="exploration",
                record_type="Airborne assessment file",
                external_id="FILENUMBER",
                name="AREA_",
                holder="COMPANY",
                issue_date="WORK_DATE",
            ),
            Layer(
                slug="mine_locations",
                source_name="Saskatchewan Geological Survey — Mine Locations",
                source_url="https://gis.saskatchewan.ca/arcgis/rest/services/"
                "Economy/Mineral_Exploration/MapServer",
                layer_id=1,
                category="operation",
                record_type="Mine location",
                external_id="SMDI",
                name="NAME",
                status="STATUS",
                commodity="COMMODITY",
                location="LOCATION",
                source_link="WEBLINK",
            ),
        ],
    },
    "ontario": {
        "name": "Ontario",
        "abbreviation": "ON",
        "pruid": "35",
        "territory_source": HISTORIC_TREATIES,
        "territory_name_field": "ENAME",
        "territory_alt_field": "SUBTYPE_ENAME",
        "layers": [
            Layer(
                slug="mining_claims",
                source_name="Government of Ontario MLAS — Mining Claims",
                source_url="https://ws.lioservices.lrc.gov.on.ca/arcgis1071a/rest/"
                "services/MLAS/mlas_op/MapServer",
                layer_id=1,
                category="claim",
                record_type="Mining claim",
                external_id="TENURE_NUMBER_ID",
                name="TENURE_NUMBER_ID",
                status="TENURE_STATUS_DESC",
                holder="HOLDER",
                issue_date="ISSUE_DATE",
                expiry_date="CLAIM_DUE_DATE",
            ),
            Layer(
                slug="mining_leases",
                source_name="Government of Ontario MLAS — Mining Leases",
                source_url="https://ws.lioservices.lrc.gov.on.ca/arcgis1071a/rest/"
                "services/MLAS/mlas_op/MapServer",
                layer_id=3,
                category="operation",
                record_type="Mining lease",
                external_id="TENURE_NUMBER_ID",
                name="TENURE_NUMBER_ID",
                status="DISPOSITION_LEGAL_RIGHT_DESC",
                area="AREA_IN_HECTARES",
            ),
            Layer(
                slug="mining_licences_of_occupation",
                source_name="Government of Ontario MLAS — Mining Licences of Occupation",
                source_url="https://ws.lioservices.lrc.gov.on.ca/arcgis1071a/rest/"
                "services/MLAS/mlas_op/MapServer",
                layer_id=4,
                category="operation",
                record_type="Mining licence of occupation",
                external_id="TENURE_NUMBER_ID",
                name="TENURE_NUMBER_ID",
                status="DISPOSITION_LEGAL_RIGHT_DESC",
                area="AREA_IN_HECTARES",
            ),
            Layer(
                slug="exploratory_licences_of_occupation",
                source_name="Government of Ontario MLAS — Exploratory Licences of Occupation",
                source_url="https://ws.lioservices.lrc.gov.on.ca/arcgis1071a/rest/"
                "services/MLAS/mlas_op/MapServer",
                layer_id=6,
                category="exploration",
                record_type="Exploratory licence of occupation",
                external_id="TENURE_NUMBER_ID",
                name="TENURE_NUMBER_ID",
                status="DISPOSITION_LEGAL_RIGHT_DESC",
                area="AREA_IN_HECTARES",
            ),
            Layer(
                slug="active_early_exploration",
                source_name="Government of Ontario MLAS — Active Early Exploration Instruments",
                source_url="https://ws.lioservices.lrc.gov.on.ca/arcgis1071a/rest/"
                "services/MLAS/mlas_op/MapServer",
                layer_id=27,
                category="exploration",
                record_type="Active early exploration instrument",
                external_id="EARLY_EXPLORATION_NUMBER",
                name="PROJECT_NAME",
                status="EARLY_EXPLORATION_STATUS_DESC",
                holder="TENURE_HOLDER",
                issue_date="SUBMISSION_DATE",
                location="TOWNSHIP_NAME",
            ),
            Layer(
                slug="producing_mines",
                source_name="Government of Ontario — Ontario Mineral Inventory",
                source_url="https://ws.lioservices.lrc.gov.on.ca/arcgis1071a/rest/"
                "services/GeologyOntario/GeologyOntario_Map/MapServer",
                layer_id=46,
                category="operation",
                record_type="Producing mine",
                where="STATUS='Producing Mine'",
                external_id="MDI_IDENT",
                name="NAME",
                status="STATUS",
                commodity="PRIMARY_COMMODITIES",
                location="TOWNSHIP",
                source_link="INFO_LINK",
            ),
        ],
    },
}
