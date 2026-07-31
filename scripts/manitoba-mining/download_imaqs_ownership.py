#!/usr/bin/env python3
"""Download public iMaQs disposition-holder exports.

The GIS feature service intentionally omits holder names. Manitoba's public
Mining Search exposes those names and provides a bulk Excel export. This script
submits the public search form and downloads that export for each title type.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from lxml import html

SEARCH_URL = "https://web33.gov.mb.ca/imaqs/page/viewer/mineralSearch/searchForm.jsf"
TITLE_TYPES = {
    "MC4": "mining_claim_holders",
    "MEL": "mineral_exploration_licence_holders",
    "ML": "mineral_lease_holders",
}
USER_AGENT = "Waniska-Manitoba-Mining-Ownership-Research/1.0"


def form_values(form) -> list[tuple[str, str]]:
    values: list[tuple[str, str]] = []
    for element in form.xpath(".//input[@name] | .//select[@name]"):
        if element.get("disabled") is not None:
            continue
        name = element.get("name")
        if element.tag == "select":
            selected = element.xpath("./option[@selected]")
            option = selected[0] if selected else (element.xpath("./option") or [None])[0]
            if option is not None:
                values.append((name, option.get("value", option.text or "")))
            continue
        input_type = (element.get("type") or "text").lower()
        if input_type in {"button", "reset", "file"}:
            continue
        if input_type in {"checkbox", "radio"} and element.get("checked") is None:
            continue
        if input_type == "submit":
            continue
        values.append((name, element.get("value", "")))
    return values


def request(opener, url: str, data: list[tuple[str, str]] | None = None):
    encoded = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=encoded, headers={"User-Agent": USER_AGENT})
    return opener.open(req, timeout=180)


def jsf_action(onclick: str) -> list[tuple[str, str]]:
    # JSF generates {'component:key':'component:key'} in the export link.
    pairs = re.findall(r"'([^']+)'\s*:\s*'([^']+)'", onclick or "")
    if not pairs:
        raise RuntimeError("Could not identify the iMaQs Excel export action")
    return pairs


def download_title_type(code: str, output: Path, status: str = "") -> dict:
    cookies = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))

    with request(opener, SEARCH_URL) as response:
        search_url = response.geturl()
        document = html.fromstring(response.read(), base_url=search_url)
    form = document.get_element_by_id("load")
    values = form_values(form)
    values = [(name, value) for name, value in values if name not in {"load:availableTitles", "load:status"}]
    values.extend(
        [
            ("load:availableTitles", code),
            ("load:status", status),
            ("load:nxtBtn1", ""),
        ]
    )
    action = urllib.parse.urljoin(search_url, form.get("action"))
    with request(opener, action, values) as response:
        result_url = response.geturl()
        result_body = response.read()
    debug_result = output.with_suffix(".results.html")
    debug_result.write_bytes(result_body)
    result = html.fromstring(result_body, base_url=result_url)
    errors = [" ".join(node.text_content().split()) for node in result.xpath("//*[contains(@class,'error_text')]")]
    if errors:
        raise RuntimeError(f"iMaQs search failed for {code}: {'; '.join(errors)}")

    excel_links = result.xpath("//a[normalize-space(.)='Excel']")
    if len(excel_links) != 1:
        raise RuntimeError(f"Expected one Excel export link for {code}; found {len(excel_links)}")
    export_link = excel_links[0]
    export_form = export_link
    while export_form is not None and export_form.tag != "form":
        export_form = export_form.getparent()
    if export_form is None:
        raise RuntimeError("Excel export link is not inside a form")
    export_values = form_values(export_form)
    export_values.extend(jsf_action(export_link.get("onclick", "")))
    export_action = urllib.parse.urljoin(result_url, export_form.get("action"))
    with request(opener, export_action, export_values) as response:
        content_type = response.headers.get_content_type()
        content_disposition = response.headers.get("Content-Disposition")
        payload = response.read()
    if payload[:2] not in (b"PK", b"\xd0\xcf") and b"<html" in payload[:500].lower():
        output.with_suffix(".export_error.html").write_bytes(payload)
        raise RuntimeError(
            f"iMaQs returned HTML instead of an Excel export for {code} "
            f"({content_type}; {content_disposition or 'no content-disposition'})"
        )
    debug_result.unlink(missing_ok=True)
    output.write_bytes(payload)
    return {
        "title_type": code,
        "file": str(output),
        "bytes": len(payload),
        "content_type": content_type,
        "status": status or "ALL",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, default=Path("data/manitoba-mining/raw/ownership"))
    parser.add_argument("--types", nargs="+", choices=sorted(TITLE_TYPES), default=list(TITLE_TYPES))
    parser.add_argument("--status", default="")
    args = parser.parse_args()
    args.raw_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "source_url": SEARCH_URL,
        "exports": [],
    }
    for code in args.types:
        stem = TITLE_TYPES[code]
        suffix = f"_{args.status.lower()}" if args.status else ""
        result = download_title_type(code, args.raw_dir / f"{stem}{suffix}.xls", args.status)
        manifest["exports"].append(result)
        print(f"{stem}: {result['bytes']:,} bytes")
    (args.raw_dir / "ownership_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
