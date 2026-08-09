#!/usr/bin/env python3
"""Download active Nova Scotia right holders from the public NovaROC search."""

from __future__ import annotations

import csv
import http.cookiejar
import re
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

from lxml import html
import xlrd

SEARCH_URL = "https://novaroc.novascotia.ca/novaroc/page/viewer/mineralSearch/searchForm.jsf"
TITLE_TYPES = ("EL", "MLE")
USER_AGENT = "Waniska-Watch-Public-Records/1.0"


def form_values(form) -> list[tuple[str, str]]:
    values: list[tuple[str, str]] = []
    for element in form.xpath(".//input[@name] | .//select[@name]"):
        if element.get("disabled") is not None:
            continue
        name = element.get("name")
        input_type = (element.get("type") or "text").lower()
        if input_type in {"button", "reset", "file", "submit"}:
            continue
        if input_type in {"checkbox", "radio"} and element.get("checked") is None:
            continue
        if element.tag == "select":
            selected = element.xpath("./option[@selected]") or element.xpath("./option")[:1]
            values.extend((name, option.get("value", option.text or "")) for option in selected)
        else:
            values.append((name, element.get("value", "")))
    return values


def request(opener, url: str, data: list[tuple[str, str]] | None = None):
    encoded = urllib.parse.urlencode(data).encode() if data is not None else None
    return opener.open(
        urllib.request.Request(url, data=encoded, headers={"User-Agent": USER_AGENT}),
        timeout=180,
    )


def jsf_action(onclick: str) -> list[tuple[str, str]]:
    pairs = re.findall(r"'([^']+)'\s*:\s*'([^']+)'", onclick or "")
    if not pairs:
        raise RuntimeError("Could not identify the NovaROC Excel export action")
    return pairs


def main() -> None:
    destination = Path("data/nova-scotia-mining/processed/holder_overrides.csv")
    cookies = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
    with request(opener, SEARCH_URL) as response:
        search_url = response.geturl()
        document = html.fromstring(response.read(), base_url=search_url)
    form = document.get_element_by_id("load")
    values = [
        (name, value)
        for name, value in form_values(form)
        if name not in {"load:availableTitlesManyList", "selectedRadioStatus", "load:selectedReportType"}
    ]
    values.extend(("load:availableTitlesManyList", code) for code in TITLE_TYPES)
    values.extend(
        [
            ("selectedRadioStatus", "Active"),
            ("load:selectedReportType", "Active"),
            ("load:nxtBtn1", ""),
        ]
    )
    with request(opener, urllib.parse.urljoin(search_url, form.get("action")), values) as response:
        result_url = response.geturl()
        result = html.fromstring(response.read(), base_url=result_url)
    errors = [" ".join(node.text_content().split()) for node in result.xpath("//*[contains(@class,'error')]")]
    if errors:
        raise RuntimeError(f"NovaROC active-title search failed: {'; '.join(errors)}")
    links = [link for link in result.xpath("//a") if " ".join(link.text_content().split()) == "Excel"]
    if len(links) != 1:
        raise RuntimeError(f"Expected one NovaROC Excel export link; found {len(links)}")
    link = links[0]
    export_form = link
    while export_form is not None and export_form.tag != "form":
        export_form = export_form.getparent()
    if export_form is None:
        raise RuntimeError("NovaROC Excel link is not inside a form")
    export_values = form_values(export_form) + jsf_action(link.get("onclick", ""))
    with request(
        opener,
        urllib.parse.urljoin(result_url, export_form.get("action")),
        export_values,
    ) as response:
        payload = response.read()
    workbook = xlrd.open_workbook(file_contents=payload)
    sheet = workbook.sheet_by_index(0)
    headers = [str(value).strip() for value in sheet.row_values(0)]
    rows = []
    for row_index in range(1, sheet.nrows):
        values = dict(zip(headers, sheet.row_values(row_index)))
        external_id = str(values.get("Right Number") or "").strip()
        holder = str(values.get("Holder Name") or "").strip()
        if external_id and holder:
            rows.append(
                {
                    "external_id": external_id,
                    "holder": holder,
                    "evidence_url": SEARCH_URL,
                    "evidence_date": date.today().isoformat(),
                    "relationship": "Recorded licence or lease holder",
                }
            )
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows):,} active NovaROC holder records to {destination}")


if __name__ == "__main__":
    main()
