#!/usr/bin/env python3
"""Download current New Brunswick title holders from the public NB e-CLAIMS search."""

from __future__ import annotations

import csv
import http.cookiejar
import json
import re
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

from lxml import html
import xlrd

HOME_URL = "https://nbeclaims.gnb.ca/nbeclaims/page/home.jsf"
SEARCH_URL = "https://nbeclaims.gnb.ca/nbeclaims/page/viewer/searchForm.jsf"
USER_AGENT = "Waniska-Watch-Public-Records/1.0"


def form_values(form) -> list[tuple[str, str]]:
    values: list[tuple[str, str]] = []
    for element in form.xpath(".//input[@name] | .//select[@name]"):
        name = element.get("name")
        input_type = (element.get("type") or "text").lower()
        if element.get("disabled") is not None or input_type in {"button", "reset", "file", "submit"}:
            continue
        if input_type in {"checkbox", "radio"} and element.get("checked") is None:
            continue
        if element.tag == "select":
            selected = element.xpath("./option[@selected]") or element.xpath("./option")[:1]
            values.extend((name, option.get("value", option.text or "")) for option in selected)
        else:
            values.append((name, element.get("value", "")))
    return values


def jsf_action(onclick: str) -> list[tuple[str, str]]:
    pairs = re.findall(r"'([^']+)'\s*:\s*'([^']+)'", onclick or "")
    if not pairs:
        raise RuntimeError("Could not identify the NB e-CLAIMS action")
    return pairs


def request(opener, url: str, data: list[tuple[str, str]] | None = None):
    encoded = urllib.parse.urlencode(data).encode() if data is not None else None
    return opener.open(
        urllib.request.Request(url, data=encoded, headers={"User-Agent": USER_AGENT}),
        timeout=240,
    )


def main() -> None:
    destination = Path("data/new-brunswick-mining/processed/holder_overrides.csv")
    cookies = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
    with request(opener, HOME_URL) as response:
        home_url = response.geturl()
        document = html.fromstring(response.read(), base_url=home_url)
    search_links = document.xpath("//a[.//img[contains(@src,'en_search')]]")
    if len(search_links) != 1:
        raise RuntimeError(f"Expected one NB e-CLAIMS guest-search link; found {len(search_links)}")
    search_link = search_links[0]
    home_form = search_link
    while home_form is not None and home_form.tag != "form":
        home_form = home_form.getparent()
    with request(
        opener,
        urllib.parse.urljoin(home_url, home_form.get("action")),
        form_values(home_form) + jsf_action(search_link.get("onclick", "")),
    ) as response:
        search_url = response.geturl()
        search = html.fromstring(response.read(), base_url=search_url)
    form = search.get_element_by_id("load")
    excluded = {"load:status", "load:forfStartDate", "load:forfEndDate"}
    values = [(name, value) for name, value in form_values(form) if name not in excluded]
    values.extend(
        [
            ("load:status", "GOOD"),
            ("load:forfStartDate", date.today().isoformat()),
            ("load:forfEndDate", "2100-01-01"),
            ("load:j_idt9", ""),
        ]
    )
    with request(opener, urllib.parse.urljoin(search_url, form.get("action")), values) as response:
        result_url = response.geturl()
        result = html.fromstring(response.read(), base_url=result_url)
    errors = [" ".join(node.text_content().split()) for node in result.xpath("//*[contains(@class,'error')]")]
    if errors:
        raise RuntimeError(f"NB e-CLAIMS current-title search failed: {'; '.join(errors)}")
    links = [link for link in result.xpath("//a") if " ".join(link.text_content().split()) == "Excel"]
    if len(links) != 1:
        raise RuntimeError(f"Expected one NB e-CLAIMS Excel export link; found {len(links)}")
    link = links[0]
    export_form = link
    while export_form is not None and export_form.tag != "form":
        export_form = export_form.getparent()
    with request(
        opener,
        urllib.parse.urljoin(result_url, export_form.get("action")),
        form_values(export_form) + jsf_action(link.get("onclick", "")),
    ) as response:
        payload = response.read()
    workbook = xlrd.open_workbook(file_contents=payload)
    sheet = workbook.sheet_by_index(0)
    headers = [str(value).strip() for value in sheet.row_values(0)]
    rows = []
    for row_index in range(1, sheet.nrows):
        values = dict(zip(headers, sheet.row_values(row_index)))
        external_id = str(values.get("Right Number") or "").strip()
        holder = str(values.get("Right Holder Name") or "").strip()
        duplicate_parts = holder.split(", ")
        if len(duplicate_parts) == 2 and duplicate_parts[0] == duplicate_parts[1]:
            holder = duplicate_parts[0]
        if external_id and holder:
            rows.append(
                {
                    "external_id": external_id,
                    "holder": holder,
                    "evidence_url": SEARCH_URL,
                    "evidence_date": date.today().isoformat(),
                    "relationship": "Recorded right holder",
                }
            )
    found = {row["external_id"] for row in rows}
    current_ids: set[str] = set()
    for page in Path("data/new-brunswick-mining/raw/mineral_claims").glob("page-*.geojson"):
        payload = json.loads(page.read_text(encoding="utf-8"))
        current_ids.update(
            str((feature.get("properties") or {}).get("TENURE_NUMBER_ID") or "").strip()
            for feature in payload.get("features") or []
        )
    current_ids.discard("")

    def lookup_exception(external_id: str) -> str | None:
        exception_opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        with request(exception_opener, HOME_URL) as response:
            page_url = response.geturl()
            page = html.fromstring(response.read(), base_url=page_url)
        link = page.xpath("//a[.//img[contains(@src,'en_search')]]")[0]
        navigation_form = link
        while navigation_form is not None and navigation_form.tag != "form":
            navigation_form = navigation_form.getparent()
        with request(
            exception_opener,
            urllib.parse.urljoin(page_url, navigation_form.get("action")),
            form_values(navigation_form) + jsf_action(link.get("onclick", "")),
        ) as response:
            exception_url = response.geturl()
            exception_search = html.fromstring(response.read(), base_url=exception_url)
        exception_form = exception_search.get_element_by_id("load")
        exception_values = [
            (name, value)
            for name, value in form_values(exception_form)
            if name not in {"load:status", "load:tenureNumberID"}
        ]
        exception_values.extend(
            [("load:status", "ALL"), ("load:tenureNumberID", external_id), ("load:j_idt9", "")]
        )
        with request(
            exception_opener,
            urllib.parse.urljoin(exception_url, exception_form.get("action")),
            exception_values,
        ) as response:
            detail = html.fromstring(response.read())
        owner_cells = []
        for table_row in detail.xpath("//tr"):
            cells = [" ".join(cell.text_content().split()) for cell in table_row.xpath("./td")]
            if cells and cells[0] == "Owners" and len(cells) > 1:
                owner_cells.append(cells[1])
        if not owner_cells:
            return None
        matches = re.findall(
            r"(?:^|\s)\d{3,}\s+(.+?)\s+\d+(?:\.\d+)?%(?=\s+\d{3,}\s+|$)",
            " ".join(owner_cells),
        )
        return " | ".join(dict.fromkeys(name.strip() for name in matches if name.strip())) or None

    for external_id in sorted(current_ids - found):
        holder = lookup_exception(external_id)
        rows.append(
            {
                "external_id": external_id,
                "holder": holder or "",
                "evidence_url": SEARCH_URL,
                "evidence_date": date.today().isoformat(),
                "relationship": (
                    "Recorded right holder"
                    if holder
                    else "Registry checked — holder unavailable"
                ),
            }
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    holder_count = sum(bool(row["holder"]) for row in rows)
    print(
        f"Wrote {holder_count:,} current NB e-CLAIMS holder records and "
        f"{len(rows) - holder_count:,} checked-unavailable records to {destination}"
    )


if __name__ == "__main__":
    main()
