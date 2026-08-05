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

MODERN_TREATIES = (
    "Crown-Indigenous Relations and Northern Affairs Canada — Modern Treaties",
    "https://geo.sac-isc.gc.ca/geomatics/rest/services/"
    "Donnees_Ouvertes-Open_Data/Modern_Treaty_E/MapServer",
    0,
)

SASKATCHEWAN_TREATIES = (
    "Government of Saskatchewan — First Nation Treaty Boundaries",
    "https://gis.saskatchewan.ca/arcgis/rest/services/AboriginalLands/MapServer",
    2,
)

PROVINCES = {
    "alberta": {
        "name": "Alberta",
        "abbreviation": "AB",
        "pruid": "48",
        "catalogue_url": "https://www.alberta.ca/minerals-permits-and-leasing-overview",
        "territory_source": HISTORIC_TREATIES,
        "territory_name_field": "ENAME",
        "territory_alt_field": "SUBTYPE_ENAME",
        "layers": [
            Layer(
                slug="metallic_industrial_permits",
                source_name="Alberta Energy and Minerals — Metallic and Industrial Mineral Permits",
                source_url="https://gis.energy.gov.ab.ca/arcgis/rest/services/Geoview/"
                "Mineral_Agreements_Overview_Ext_PROD/MapServer",
                layer_id=13,
                category="claim",
                record_type="Metallic and industrial mineral permit",
                external_id="DesRepId",
                name="DesRepId",
                commodity="Substance",
            ),
            Layer(
                slug="metallic_industrial_leases",
                source_name="Alberta Energy and Minerals — Metallic and Industrial Mineral Leases",
                source_url="https://gis.energy.gov.ab.ca/arcgis/rest/services/Geoview/"
                "Mineral_Agreements_Overview_Ext_PROD/MapServer",
                layer_id=15,
                category="operation",
                record_type="Metallic and industrial mineral lease",
                external_id="DesRepId",
                name="DesRepId",
                commodity="Substance",
            ),
            Layer(
                slug="brine_hosted_leases",
                source_name="Alberta Energy and Minerals — Brine-hosted Mineral Leases",
                source_url="https://gis.energy.gov.ab.ca/arcgis/rest/services/Geoview/"
                "Mineral_Agreements_Overview_Ext_PROD/MapServer",
                layer_id=16,
                category="operation",
                record_type="Brine-hosted mineral lease",
                external_id="DesRepId",
                name="DesRepId",
                commodity="Substance",
            ),
            Layer(
                slug="brine_licences",
                source_name="Alberta Energy and Minerals — Brine-hosted Mineral Licences",
                source_url="https://gis.energy.gov.ab.ca/arcgis/rest/services/Geoview/"
                "Mineral_Agreements_Overview_Ext_PROD/MapServer",
                layer_id=19,
                category="exploration",
                record_type="Brine-hosted mineral licence",
                external_id="DesRepId",
                name="DesRepId",
                commodity="Substance",
            ),
        ],
    },
    "new-brunswick": {
        "name": "New Brunswick",
        "abbreviation": "NB",
        "pruid": "13",
        "catalogue_url": "https://geonb.snb.ca/",
        "territory_source": HISTORIC_TREATIES,
        "territory_name_field": "ENAME",
        "territory_alt_field": "SUBTYPE_ENAME",
        "layers": [
            Layer(
                slug="mineral_claims",
                source_name="Government of New Brunswick — Mineral Claims",
                source_url="https://gis-erd-der.gnb.ca/server/rest/services/OpenData/"
                "Mineral_Claims/MapServer",
                layer_id=0,
                category="claim",
                record_type="Mineral claim",
                external_id="TENURE_NUMBER_ID",
                name="TENURE_NUMBER_ID",
            ),
        ],
    },
    "nova-scotia": {
        "name": "Nova Scotia",
        "abbreviation": "NS",
        "pruid": "12",
        "catalogue_url": "https://novarocmaps.novascotia.ca/arcgis/rest/services/NovaRoc/MapServer",
        "territory_source": HISTORIC_TREATIES,
        "territory_name_field": "ENAME",
        "territory_alt_field": "SUBTYPE_ENAME",
        "layers": [
            Layer(
                slug="exploration_licences",
                source_name="Government of Nova Scotia NovaROC — Exploration Licences",
                source_url="https://novarocmaps.novascotia.ca/arcgis/rest/services/NovaRoc/MapServer",
                layer_id=1,
                category="exploration",
                record_type="Exploration licence",
                external_id="TENURE_NUMBER_ID",
                name="TENURE_NUMBER_ID",
                status="MINERAL_TENURE_STATUS_CODE",
                issue_date="ISSUE_DATE",
                expiry_date="EXPIRY_DATE",
                area="AREA_IN_HECTARES",
            ),
            Layer(
                slug="mineral_leases",
                source_name="Government of Nova Scotia NovaROC — Mineral Leases",
                source_url="https://novarocmaps.novascotia.ca/arcgis/rest/services/NovaRoc/MapServer",
                layer_id=7,
                category="operation",
                record_type="Mineral lease",
                external_id="TENURE_NUMBER_ID",
                name="TENURE_NUMBER_ID",
                status="MINERAL_TENURE_STATUS_CODE",
                issue_date="ISSUE_DATE",
                expiry_date="EXPIRY_DATE",
                area="AREA_IN_HECTARES",
            ),
        ],
    },
    "newfoundland-and-labrador": {
        "name": "Newfoundland and Labrador",
        "abbreviation": "NL",
        "pruid": "10",
        "catalogue_url": "https://www.gov.nl.ca/em/mines/geoscience-online/",
        "territory_source": MODERN_TREATIES,
        "territory_name_field": "ENAME",
        "territory_alt_field": "SUBTYPE_ENAME",
        "territory_context_type": "modern_treaty",
        "layers": [
            Layer(
                slug="map_staked_claims",
                source_name="Government of Newfoundland and Labrador — Map Staked Claims",
                source_url="https://dnrmaps.gov.nl.ca/arcgis/rest/services/GeoAtlas/"
                "Mineral_Lands/MapServer",
                layer_id=0,
                category="claim",
                record_type="Mineral licence / map-staked claim",
                external_id="LICENSE_NBR",
                name="LICENSE_NBR",
                status="STATUS",
                holder="CLIENT_NAME",
                issue_date="STAKEDATE",
                expiry_date="EXPIRYDATE",
                location="LOCATION",
            ),
        ],
    },
    "yukon": {
        "name": "Yukon",
        "abbreviation": "YT",
        "pruid": "60",
        "catalogue_url": "https://open.yukon.ca/data/?tags=mining",
        "territory_source": (
            "Government of Yukon — Treaties and Agreements",
            "https://mapservices.gov.yk.ca/arcgis/rest/services/GeoYukon/"
            "GY_FirstNations/MapServer",
            13,
        ),
        "territory_name_field": "BOUNDARY_NAME",
        "territory_alt_field": "IG_NAME",
        "territory_context_type": "treaty_or_agreement",
        "layers": [
            Layer(
                slug="placer_claims",
                source_name="Government of Yukon GeoYukon — Placer Claims",
                source_url="https://mapservices.gov.yk.ca/arcgis/rest/services/GeoYukon/"
                "GY_Mining/MapServer",
                layer_id=11,
                category="claim",
                record_type="Placer claim",
                external_id="GRANT_NUMBER",
                name="CLAIM_NAME",
                status="TENURE_STATUS",
                holder="OWNER_NAME",
                issue_date="RECORDED_DATE",
                expiry_date="EXPIRY_DATE",
                location="DISTRICT_NAME",
            ),
            Layer(
                slug="placer_leases",
                source_name="Government of Yukon GeoYukon — Placer Leases",
                source_url="https://mapservices.gov.yk.ca/arcgis/rest/services/GeoYukon/"
                "GY_Mining/MapServer",
                layer_id=12,
                category="operation",
                record_type="Placer lease",
                external_id="GRANT_NUMBER",
                name="GRANT_NUMBER",
                status="TENURE_STATUS",
                holder="OWNER_NAME",
                issue_date="RECORDED_DATE",
                expiry_date="EXPIRY_DATE",
                location="DISTRICT_NAME",
            ),
            Layer(
                slug="quartz_claims",
                source_name="Government of Yukon GeoYukon — Quartz Claims",
                source_url="https://mapservices.gov.yk.ca/arcgis/rest/services/GeoYukon/"
                "GY_Mining/MapServer",
                layer_id=36,
                category="claim",
                record_type="Quartz claim",
                external_id="GRANT_NUMBER",
                name="CLAIM_NAME",
                status="TENURE_STATUS",
                holder="OWNER_NAME",
                issue_date="RECORDED_DATE",
                expiry_date="EXPIRY_DATE",
                location="DISTRICT_NAME",
            ),
            Layer(
                slug="quartz_leases",
                source_name="Government of Yukon GeoYukon — Quartz Leases",
                source_url="https://mapservices.gov.yk.ca/arcgis/rest/services/GeoYukon/"
                "GY_Mining/MapServer",
                layer_id=37,
                category="operation",
                record_type="Quartz lease",
                external_id="LEASE_NUMBER",
                name="CLAIM_NAME",
                status="TENURE_STATUS",
                holder="OWNER_NAME",
                issue_date="RECORDED_DATE",
                expiry_date="EXPIRY_DATE",
                location="DISTRICT_NAME",
            ),
        ],
    },
    "nunavut": {
        "name": "Nunavut",
        "abbreviation": "NU",
        "pruid": "62",
        "catalogue_url": "https://open.canada.ca/data/en/dataset/2e6f97df-eeae-462b-902d-4453a1c1034b",
        "territory_source": (
            "CIRNAC and ISC — Modern Treaties",
            "https://geo.sac-isc.gc.ca/geomatics/rest/services/"
            "Donnees_Ouvertes-Open_Data/Modern_Treaty_E/MapServer",
            0,
        ),
        "territory_name_field": "ENAME",
        "territory_alt_field": "SUBTYPE_ENAME",
        "territory_context_type": "modern_treaty",
        "layers": [
            Layer(
                slug="mineral_claims",
                source_name="CIRNAC — Nunavut Mineral Claims",
                source_url="https://geo.sac-isc.gc.ca/geomatics/rest/services/"
                "Donnees_Ouvertes-Open_Data/Claim_minier_NU_Mineral_Claim/MapServer",
                layer_id=0,
                category="claim",
                record_type="Mineral claim",
                external_id="CLAIM_NUM",
                name="CLAIM_NAME",
                status="CLAIM_STAT",
                holder="OWNERS",
                issue_date="ISSUE_DATE",
                expiry_date="CANCEL_DT",
                area="AREA_HA",
                location="DISTRICT",
            ),
            Layer(
                slug="mining_leases",
                source_name="CIRNAC — Nunavut Mining Leases",
                source_url="https://geo.sac-isc.gc.ca/geomatics/rest/services/"
                "Donnees_Ouvertes-Open_Data/Bail_minier_NU_Mining_Lease/MapServer",
                layer_id=0,
                category="operation",
                record_type="Mining lease",
                external_id="LEASE_NUM",
                name="LEASE_NUM",
                status="LEASE_STAT",
                holder="OWNERS",
                issue_date="ISSUE_DT",
                expiry_date="TERM_EXPIRY_DATE",
                area="AREA_HA",
                location="DISTRICT",
            ),
            Layer(
                slug="coal_exploration_licences",
                source_name="CIRNAC — Nunavut Coal Exploration Licences",
                source_url="https://geo.sac-isc.gc.ca/geomatics/rest/services/"
                "Donnees_Ouvertes-Open_Data/"
                "Licence_exploration_houille_NU_Coal_Exploration_Licence/MapServer",
                layer_id=0,
                category="exploration",
                record_type="Coal exploration licence",
                external_id="LIC_NUM",
                name="LIC_NUM",
                status="STATUS",
                holder="OWNER",
                issue_date="EFF_DATE",
                area="AREA_HA",
                location="NTS",
            ),
        ],
    },
    "saskatchewan": {
        "name": "Saskatchewan",
        "abbreviation": "SK",
        "pruid": "47",
        "catalogue_url": "https://gis.saskatchewan.ca/arcgis/rest/services/Economy",
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
        "catalogue_url": "https://ws.lioservices.lrc.gov.on.ca/arcgis1071a/rest/services/MLAS",
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
