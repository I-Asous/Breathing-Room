#!/usr/bin/env python3
"""Build the neighborhood snapshot used by Where It Lands.

Sources (all public):
- NYC Open Data c3uy-2p5r, Air Quality and Health Impacts, UHF42
- Zillow Observed Rent Index, ZIP, smoothed, all homes plus multifamily
- NYC Open Data hg8x-zxpr, Affordable Housing Production by Building
- FirstMover NYC open listing extracts (asking rent, 2025-02 through 2026-08)
- NYC Health UHF42 boundaries
"""

from __future__ import annotations

import csv
import io
import json
import math
import statistics
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__import__("os").environ.get("CITY_DATA_DIR", "/tmp/citydata"))
OUT_DIR = Path(__file__).resolve().parents[1] / "src" / "data"
NYC_COUNTIES = {
    "Bronx County",
    "Kings County",
    "New York County",
    "Queens County",
    "Richmond County",
}
FM_MONTHS = [
    "2025-02",
    "2025-03",
    "2025-04",
    "2025-05",
    "2025-06",
    "2025-07",
    "2025-08",
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "where-it-lands/divhacks"})
    with urllib.request.urlopen(req, timeout=180) as res:
        return res.read()


def point_in_ring(x: float, y: float, ring: list) -> bool:
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y):
            denom = yj - yi
            if denom == 0:
                j = i
                continue
            x_cross = (xj - xi) * (y - yi) / denom + xi
            if x < x_cross:
                inside = not inside
        j = i
    return inside


def point_in_geom(x: float, y: float, geom: dict) -> bool:
    gtype = geom["type"]
    if gtype == "Polygon":
        rings = geom["coordinates"]
        if not rings or not point_in_ring(x, y, rings[0]):
            return False
        return not any(point_in_ring(x, y, hole) for hole in rings[1:])
    if gtype == "MultiPolygon":
        for poly in geom["coordinates"]:
            if not poly or not point_in_ring(x, y, poly[0]):
                continue
            if any(point_in_ring(x, y, hole) for hole in poly[1:]):
                continue
            return True
    return False


def bbox(geom: dict) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []

    def walk(node):
        if isinstance(node, (list, tuple)):
            if len(node) >= 2 and isinstance(node[0], (int, float)):
                xs.append(float(node[0]))
                ys.append(float(node[1]))
            else:
                for child in node:
                    walk(child)

    walk(geom["coordinates"])
    return min(xs), min(ys), max(xs), max(ys)


def centroid(geom: dict) -> tuple[float, float]:
    minx, miny, maxx, maxy = bbox(geom)
    return (minx + maxx) / 2, (miny + maxy) / 2


def round_coords(node, places=4):
    if isinstance(node, (list, tuple)):
        if len(node) >= 2 and isinstance(node[0], (int, float)) and not isinstance(node[0], bool):
            return [round(float(node[0]), places), round(float(node[1]), places)]
        return [round_coords(child, places) for child in node]
    return node


def median(values: list[float]) -> float | None:
    clean = [v for v in values if v is not None and math.isfinite(v)]
    if not clean:
        return None
    return float(statistics.median(clean))


def num(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(n):
        return None
    return n


def ensure(name: str, url: str) -> None:
    path = ROOT / name
    if path.exists() and path.stat().st_size > 0:
        return
    print("download", name)
    path.write_bytes(fetch(url))


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    ensure(
        "uhf.geojson",
        "https://raw.githubusercontent.com/nychealth/EHDP-data/production/geography/UHF42.geojson",
    )
    ensure(
        "air.json",
        "https://data.cityofnewyork.us/resource/c3uy-2p5r.json?$select=indicator_id,name,geo_join_id,geo_place_name,time_period,data_value,measure,measure_info&$where=geo_type_name=%27UHF42%27%20AND%20indicator_id%20in(%271425%27,%271431%27,%27648%27,%27657%27)&$limit=5000",
    )
    ensure(
        "air-city.json",
        "https://data.cityofnewyork.us/resource/c3uy-2p5r.json?$select=indicator_id,name,time_period,data_value,measure&$where=geo_type_name=%27Citywide%27%20AND%20indicator_id%20in(%271425%27,%271431%27,%27648%27,%27657%27)&$limit=500",
    )
    ensure(
        "housing.json",
        "https://data.cityofnewyork.us/resource/hg8x-zxpr.json?$select=project_id,project_name,project_start_date,borough,latitude,longitude,extremely_low_income_units,very_low_income_units,low_income_units,counted_rental_units,all_counted_units,total_units,community_board&$limit=10000",
    )
    ensure(
        "zori.zip.csv",
        "https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv",
    )
    uhf_raw = json.loads((ROOT / "uhf.geojson").read_text())
    areas = []
    for feature in uhf_raw["features"]:
        props = feature["properties"]
        uid = str(props["id"])
        if uid == "0" or not props.get("GEONAME"):
            continue
        geom = feature["geometry"]
        areas.append(
            {
                "id": uid,
                "name": props["GEONAME"],
                "borough": props["BOROUGH"],
                "geom": geom,
                "bbox": bbox(geom),
                "centroid": centroid(geom),
            }
        )
    print(f"neighborhoods {len(areas)}")

    def assign(lon: float, lat: float) -> str | None:
        for area in areas:
            minx, miny, maxx, maxy = area["bbox"]
            if lon < minx or lon > maxx or lat < miny or lat > maxy:
                continue
            if point_in_geom(lon, lat, area["geom"]):
                return area["id"]
        # ZIP centroids sometimes fall in a river or airport cutout.
        best = None
        best_d = 0.04**2
        for area in areas:
            cx, cy = area["centroid"]
            d = (cx - lon) ** 2 + (cy - lat) ** 2
            if d < best_d:
                best_d = d
                best = area["id"]
        return best

    # ZIP centroids and asking-rent medians from listing extracts.
    zip_lat: dict[str, float] = defaultdict(float)
    zip_lon: dict[str, float] = defaultdict(float)
    zip_n: dict[str, int] = defaultdict(int)
    # (month, uhf or 'city', kind) -> prices. kind is '1' or 'all'
    # We assign after ZIP->UHF is known, so store by zip first.
    prices: dict[tuple[str, str, str], list[float]] = defaultdict(list)

    for month in FM_MONTHS:
        url = (
            "https://raw.githubusercontent.com/benfwalla/firstmover-open-data-project/"
            f"main/public/data/{month}.csv"
        )
        print("listings", month)
        raw = fetch(url)
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8", "replace")))
        kept = 0
        for row in reader:
            zip_code = (row.get("zip_code") or "").strip()
            if len(zip_code) < 5:
                continue
            zip_code = zip_code[:5]
            price = num(row.get("price"))
            lat = num(row.get("latitude"))
            lon = num(row.get("longitude"))
            if lat is None or lon is None:
                continue
            if not (40.4 <= lat <= 41.0 and -74.3 <= lon <= -73.6):
                continue
            zip_lat[zip_code] += lat
            zip_lon[zip_code] += lon
            zip_n[zip_code] += 1
            if price is None or price < 700 or price > 20000:
                continue
            beds = num(row.get("bedrooms"))
            prices[(month, zip_code, "all")].append(price)
            if beds == 1:
                prices[(month, zip_code, "1")].append(price)
            kept += 1
        print("  priced rows", kept)

    zip_uhf: dict[str, str] = {}
    for zip_code, count in zip_n.items():
        lon = zip_lon[zip_code] / count
        lat = zip_lat[zip_code] / count
        uid = assign(lon, lat)
        if uid:
            zip_uhf[zip_code] = uid
    print("zips assigned", len(zip_uhf), "of", len(zip_n))

    asking: dict[str, list[dict]] = defaultdict(list)
    city_asking: list[dict] = []
    for month in FM_MONTHS:
        city_all: list[float] = []
        city_one: list[float] = []
        by_uhf_all: dict[str, list[float]] = defaultdict(list)
        by_uhf_one: dict[str, list[float]] = defaultdict(list)
        for zip_code, uid in zip_uhf.items():
            all_prices = prices.get((month, zip_code, "all"), [])
            one_prices = prices.get((month, zip_code, "1"), [])
            by_uhf_all[uid].extend(all_prices)
            by_uhf_one[uid].extend(one_prices)
            city_all.extend(all_prices)
            city_one.extend(one_prices)
        for uid in {a["id"] for a in areas}:
            med = median(by_uhf_one[uid])
            med_all = median(by_uhf_all[uid])
            n = len(by_uhf_one[uid])
            if med is None:
                continue
            asking[uid].append(
                {
                    "month": month,
                    "median1br": round(med),
                    "medianAll": round(med_all) if med_all is not None else None,
                    "n": n,
                }
            )
        city_med = median(city_one)
        if city_med is not None:
            city_asking.append(
                {
                    "month": month,
                    "median1br": round(city_med),
                    "medianAll": round(median(city_all) or city_med),
                    "n": len(city_one),
                }
            )

    # Zillow ZORI annual median across ZIPs in each neighborhood.
    zori_rows = list(csv.DictReader((ROOT / "zori.zip.csv").open()))
    date_cols = [c for c in zori_rows[0].keys() if len(c) == 10 and c[4] == "-"]
    years = sorted({c[:4] for c in date_cols})
    zori_by_uhf: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    zori_city: dict[str, list[float]] = defaultdict(list)
    zori_latest_label = date_cols[-1][:7]
    assigned_zori = 0
    for row in zori_rows:
        if row.get("State") != "NY" or row.get("CountyName") not in NYC_COUNTIES:
            continue
        zip_code = (row.get("RegionName") or "").zfill(5)
        uid = zip_uhf.get(zip_code)
        if not uid:
            # Fall back to a one-off assignment only when we have no listing centroid.
            continue
        assigned_zori += 1
        for year in years:
            vals = [num(row.get(c)) for c in date_cols if c.startswith(year)]
            med = median([v for v in vals if v is not None])
            if med is None:
                continue
            zori_by_uhf[uid][year].append(med)
            zori_city[year].append(med)
    print("zori zips used", assigned_zori, "latest", zori_latest_label)

    def series_from(bucket: dict[str, list[float]]) -> list[dict]:
        out = []
        for year in years:
            med = median(bucket.get(year, []))
            if med is None:
                continue
            out.append({"year": int(year), "value": round(med)})
        return out

    # Air
    air = json.loads((ROOT / "air.json").read_text())
    air_city = json.loads((ROOT / "air-city.json").read_text())

    def air_map(rows, indicator: str) -> dict[str, list[dict]]:
        grouped: dict[str, list[dict]] = defaultdict(list)
        for row in rows:
            if row["indicator_id"] != indicator:
                continue
            value = num(row.get("data_value"))
            if value is None:
                continue
            key = str(row.get("geo_join_id") or "city")
            period = row["time_period"]
            grouped[key].append({"period": period, "value": round(value, 2)})
        for key in grouped:
            grouped[key].sort(key=lambda item: item["period"])
        return grouped

    pm = air_map(air, "1425")
    no2 = air_map(air, "1431")
    asthma_child = air_map(air, "648")
    asthma_adult = air_map(air, "657")
    pm_city = air_map(air_city, "1425").get("city", [])
    no2_city = air_map(air_city, "1431").get("city", [])
    asthma_city = air_map(air_city, "648").get("city", [])

    # Housing production, point in polygon (a few thousand buildings).
    housing = json.loads((ROOT / "housing.json").read_text())
    units = {
        uid: {
            "eli": 0,
            "vli": 0,
            "low": 0,
            "counted": 0,
            "projects": 0,
            "since2014eli": 0,
            "since2014counted": 0,
        }
        for uid in {a["id"] for a in areas}
    }
    placed = 0
    for row in housing:
        lat = num(row.get("latitude"))
        lon = num(row.get("longitude"))
        if lat is None or lon is None:
            continue
        uid = assign(lon, lat)
        if not uid:
            continue
        placed += 1
        eli = int(num(row.get("extremely_low_income_units")) or 0)
        vli = int(num(row.get("very_low_income_units")) or 0)
        low = int(num(row.get("low_income_units")) or 0)
        counted = int(num(row.get("counted_rental_units")) or num(row.get("all_counted_units")) or 0)
        bucket = units[uid]
        bucket["eli"] += eli
        bucket["vli"] += vli
        bucket["low"] += low
        bucket["counted"] += counted
        bucket["projects"] += 1
        start = row.get("project_start_date") or ""
        year = int(start[:4]) if len(start) >= 4 and start[:4].isdigit() else 0
        if year >= 2014:
            bucket["since2014eli"] += eli + vli
            bucket["since2014counted"] += counted
    print("buildings placed", placed, "of", len(housing))

    neighborhoods = []
    for area in areas:
        uid = area["id"]
        neighborhoods.append(
            {
                "id": uid,
                "name": area["name"],
                "borough": area["borough"],
                "pm25": pm.get(uid, []),
                "no2": no2.get(uid, []),
                "asthmaChild": asthma_child.get(uid, []),
                "asthmaAdult": asthma_adult.get(uid, []),
                "zori": series_from(zori_by_uhf.get(uid, {})),
                "asking1br": asking.get(uid, []),
                "housing": units[uid],
            }
        )

    features = []
    for area in areas:
        features.append(
            {
                "type": "Feature",
                "properties": {"id": area["id"]},
                "geometry": {
                    "type": area["geom"]["type"],
                    "coordinates": round_coords(area["geom"]["coordinates"]),
                },
            }
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "generatedFrom": "public NYC and Zillow extracts",
        "zoriLatest": zori_latest_label,
        "citywide": {
            "pm25": pm_city,
            "no2": no2_city,
            "asthmaChild": asthma_city,
            "zori": series_from(zori_city),
            "asking1br": city_asking,
        },
        "neighborhoods": neighborhoods,
        "sources": [
            {
                "name": "Air Quality and Health Impacts",
                "publisher": "NYC Department of Health, NYCCAS",
                "href": "https://data.cityofnewyork.us/Environment/Air-Quality-and-Health-Impacts/c3uy-2p5r",
            },
            {
                "name": "Zillow Observed Rent Index (ZIP)",
                "publisher": "Zillow Research",
                "href": "https://www.zillow.com/research/data/",
            },
            {
                "name": "Affordable Housing Production by Building",
                "publisher": "NYC Housing Preservation and Development",
                "href": "https://data.cityofnewyork.us/Housing-Development/Affordable-Housing-Production-by-Building/hg8x-zxpr",
            },
            {
                "name": "NYC rental listing extracts",
                "publisher": "FirstMover Open Data Project",
                "href": "https://www.firstmovernyc.com/open-data",
            },
            {
                "name": "UHF42 neighborhood boundaries",
                "publisher": "NYC Health",
                "href": "https://github.com/nychealth/EHDP-data",
            },
        ],
    }
    (OUT_DIR / "city.json").write_text(json.dumps(payload, separators=(",", ":")))
    (OUT_DIR / "uhf.json").write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"))
    )
    print("wrote", OUT_DIR / "city.json", (OUT_DIR / "city.json").stat().st_size)
    print("wrote", OUT_DIR / "uhf.json", (OUT_DIR / "uhf.json").stat().st_size)


if __name__ == "__main__":
    main()
