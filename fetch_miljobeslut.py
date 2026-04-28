"""
Hämtar beslut från miljöbeslut.se och sparar dem lokalt.
"""

import csv
import io
import json
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlencode
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError


BASE_URL = "https://miljobeslut.se"
DATABASE_URL = f"{BASE_URL}/databas/"
DECISIONS_API = f"{BASE_URL}/api/decisions/"


def fetch_url(url: str, params: dict | None = None) -> bytes:
    """Hämtar innehållet från en URL."""
    if params:
        url = f"{url}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": "Mimer/1.0 (miljobeslut-fetcher)"})
    try:
        with urlopen(req, timeout=30) as response:
            return response.read()
    except HTTPError as e:
        print(
            f"HTTP-fel {e.code} vid hämtning av {url}. "
            "Kontrollera att API-adressen är korrekt och att tjänsten är tillgänglig.",
            file=sys.stderr,
        )
        raise
    except URLError as e:
        print(
            f"Nätverksfel vid hämtning av {url}: {e.reason}. "
            "Kontrollera din internetanslutning.",
            file=sys.stderr,
        )
        raise


def fetch_decisions_csv(output_path: Path | None = None) -> list[dict]:
    """
    Hämtar miljöbeslut i CSV-format från miljöbeslut.se.

    Args:
        output_path: Valfri sökväg för att spara CSV-filen lokalt.

    Returns:
        En lista med beslut som dictionaries.
    """
    url = f"{DATABASE_URL}export/csv/"
    print(f"Hämtar beslut från {url} ...")
    raw = fetch_url(url)

    if output_path is not None:
        output_path.write_bytes(raw)
        print(f"Sparade rådata till {output_path}")

    text = raw.decode("utf-8-sig")  # utf-8-sig hanterar BOM (Byte Order Mark) i CSV-exporten
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    decisions = list(reader)
    print(f"Hämtade {len(decisions)} beslut.")
    return decisions


def fetch_decisions_json(
    page: int = 1,
    page_size: int = 100,
    search: str = "",
    authority: str = "",
) -> dict:
    """
    Hämtar miljöbeslut via JSON-API från miljöbeslut.se.

    Args:
        page: Sidnummer (börjar på 1).
        page_size: Antal beslut per sida.
        search: Fritextsökning.
        authority: Filtrera på beslutsmyndighet.

    Returns:
        API-svar som dictionary med nycklarna 'count', 'next', 'previous' och 'results'.
    """
    params: dict = {"page": page, "page_size": page_size}
    if search:
        params["search"] = search
    if authority:
        params["authority"] = authority

    url = DECISIONS_API
    print(f"Hämtar sida {page} från {url} ...")
    raw = fetch_url(url, params)
    return json.loads(raw.decode("utf-8"))


def fetch_all_decisions(search: str = "", authority: str = "") -> list[dict]:
    """
    Hämtar alla miljöbeslut från miljöbeslut.se, sida för sida.

    Args:
        search: Valfri fritextsökning.
        authority: Valfritt filter på beslutsmyndighet.

    Returns:
        Komplett lista med alla matchande beslut.
    """
    all_decisions: list[dict] = []
    page = 1
    while True:
        data = fetch_decisions_json(page=page, search=search, authority=authority)
        results = data.get("results", [])
        all_decisions.extend(results)
        print(f"  Sida {page}: {len(results)} beslut (totalt hittills: {len(all_decisions)})")
        if not data.get("next"):
            break
        page += 1
    print(f"Totalt {len(all_decisions)} beslut hämtade.")
    return all_decisions


def save_decisions_json(decisions: list[dict], output_path: Path) -> None:
    """Sparar beslut till en JSON-fil."""
    output_path.write_text(
        json.dumps(decisions, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Sparade {len(decisions)} beslut till {output_path}")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Hämtar miljöbeslut från miljöbeslut.se",
    )
    parser.add_argument(
        "--format",
        choices=["csv", "json"],
        default="json",
        help="Utdataformat (standard: json)",
    )
    parser.add_argument(
        "--output",
        "-o",
        default="miljobeslut.json",
        help="Sökväg till utdatafilen (standard: miljobeslut.json)",
    )
    parser.add_argument(
        "--search",
        "-s",
        default="",
        help="Fritextsökning",
    )
    parser.add_argument(
        "--authority",
        "-a",
        default="",
        help="Filtrera på beslutsmyndighet",
    )
    args = parser.parse_args()

    output_path = Path(args.output)

    if args.format == "csv":
        if args.search or args.authority:
            print(
                "Varning: --search och --authority stöds inte med CSV-format och ignoreras.",
                file=sys.stderr,
            )
        fetch_decisions_csv(output_path=output_path)
    else:
        decisions = fetch_all_decisions(search=args.search, authority=args.authority)
        save_decisions_json(decisions, output_path)


if __name__ == "__main__":
    main()
