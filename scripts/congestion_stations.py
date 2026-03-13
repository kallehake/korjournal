"""
Trängselskatt-detektion via GPS-geofence.

Innehåller stationsdata (Stockholm + Göteborg), taxetabeller och detekteringslogik.
Anropas av byd_poll.py (och tesla_poll.py) efter att en resa avslutats.
"""

import math
from datetime import datetime, date, timedelta, timezone
from typing import List, Dict, Tuple

# ── Geometrihjälpare ─────────────────────────────────────────────────────────

def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Avstånd i meter mellan två GPS-koordinater (Haversine)."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi    = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _dist_and_t_to_segment(
    plat: float, plng: float,
    alat: float, alng: float,
    blat: float, blng: float,
) -> Tuple[float, float]:
    """
    Minimalt avstånd (m) och interpolationsparameter t ∈ [0,1] från punkt P
    till linjesegmentet A->B (approximerat i lokal plan-koordinater).
    """
    cos_lat = math.cos(math.radians((alat + blat) / 2))
    M = 111_320  # m per latitudgrad
    bx = (blng - alng) * cos_lat * M
    by = (blat - alat) * M
    px = (plng - alng) * cos_lat * M
    py = (plat - alat) * M
    seg_sq = bx * bx + by * by
    if seg_sq < 1.0:
        return _haversine_m(plat, plng, alat, alng), 0.0
    t = max(0.0, min(1.0, (px * bx + py * by) / seg_sq))
    dx = px - t * bx
    dy = py - t * by
    return math.sqrt(dx * dx + dy * dy), t


# ── Svenska helgdagar ─────────────────────────────────────────────────────────

def _easter(year: int) -> date:
    """Påskdagen – anonym gregoriansk algoritm."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f     = (b + 8) // 25
    g     = (b - f + 1) // 3
    h     = (19 * a + b - d - g + 15) % 30
    i, k  = divmod(c, 4)
    l     = (32 + 2 * e + 2 * i - h - k) % 7
    m     = (a + 11 * h + 22 * l) // 451
    month, day = divmod(114 + h + l - 7 * m, 31)
    return date(year, month, day + 1)


def _swedish_holidays(year: int) -> frozenset:
    """Alla svenska helgdagar som date-objekt för givet år."""
    easter = _easter(year)
    # Midsommarafton = fredag närmast 24 juni
    mid = date(year, 6, 24)
    midsommar_eve = mid - timedelta(days=(mid.weekday() - 4) % 7)
    # Alla helgons dag = lördag 31 okt – 6 nov
    ah = date(year, 10, 31)
    while ah.weekday() != 5:
        ah += timedelta(days=1)
    return frozenset({
        date(year, 1, 1),               # nyårsdagen
        date(year, 1, 6),               # trettondedag jul
        easter - timedelta(2),          # långfredagen
        easter,                         # påskdagen
        easter + timedelta(1),          # annandag påsk
        date(year, 5, 1),               # första maj
        easter + timedelta(39),         # Kristi himmelsfärdsdag
        easter + timedelta(49),         # pingstdagen
        date(year, 6, 6),               # nationaldagen
        midsommar_eve,                  # midsommarafton
        midsommar_eve + timedelta(1),   # midsommardagen
        ah,                             # alla helgons dag
        date(year, 12, 24),             # julafton
        date(year, 12, 25),             # juldagen
        date(year, 12, 26),             # annandag jul
        date(year, 12, 31),             # nyårsafton
    })


_holiday_cache: Dict[int, frozenset] = {}


def is_taxable_day(local_dt: datetime) -> bool:
    """True om trängselskatt tas ut den dagen (vardagar utom helgdagar och juli)."""
    d = local_dt.date()
    if local_dt.weekday() >= 5:     # lördag/söndag
        return False
    if d.month == 7:                # juli undantaget
        return False
    year = d.year
    if year not in _holiday_cache:
        _holiday_cache[year] = _swedish_holidays(year)
    return d not in _holiday_cache[year]


# ── Taxetabeller ──────────────────────────────────────────────────────────────

def _time_to_min(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def _lookup_tariff(slots: list, minute_of_day: int) -> int:
    for start, end, amount in slots:
        if _time_to_min(start) <= minute_of_day <= _time_to_min(end):
            return amount
    return 0


def _is_stockholm_peak(d: date) -> bool:
    """Högsäsong Stockholm: 1 mars – dagen före midsommarafton, 15 aug – 30 nov."""
    mid = date(d.year, 6, 24)
    midsommar_eve = mid - timedelta(days=(mid.weekday() - 4) % 7)
    spring = date(d.year, 3, 1) <= d <= (midsommar_eve - timedelta(1))
    autumn = date(d.year, 8, 15) <= d <= date(d.year, 11, 30)
    return spring or autumn


# Taxeslottar: (start, slut, SEK)
_STH_INNER_PEAK = [
    ("06:00", "06:29", 15), ("06:30", "06:59", 30), ("07:00", "08:29", 45),
    ("08:30", "08:59", 30), ("09:00", "09:29", 20), ("09:30", "14:59", 11),
    ("15:00", "15:29", 20), ("15:30", "15:59", 30), ("16:00", "17:29", 45),
    ("17:30", "17:59", 30), ("18:00", "18:29", 20),
]
_STH_INNER_LOW = [
    ("06:00", "06:29", 15), ("06:30", "06:59", 25), ("07:00", "08:29", 35),
    ("08:30", "08:59", 25), ("09:00", "09:29", 15), ("09:30", "14:59", 11),
    ("15:00", "15:29", 15), ("15:30", "15:59", 25), ("16:00", "17:29", 35),
    ("17:30", "17:59", 25), ("18:00", "18:29", 15),
]
_STH_ESSING_PEAK = [
    ("06:00", "06:29", 15), ("06:30", "06:59", 27), ("07:00", "08:29", 40),
    ("08:30", "08:59", 27), ("09:00", "09:29", 20), ("09:30", "14:59", 11),
    ("15:00", "15:29", 20), ("15:30", "15:59", 27), ("16:00", "17:29", 40),
    ("17:30", "17:59", 27), ("18:00", "18:29", 20),
]
_STH_ESSING_LOW = [
    ("06:00", "06:29", 15), ("06:30", "06:59", 22), ("07:00", "08:29", 30),
    ("08:30", "08:59", 22), ("09:00", "09:29", 15), ("09:30", "14:59", 11),
    ("15:00", "15:29", 15), ("15:30", "15:59", 22), ("16:00", "17:29", 30),
    ("17:30", "17:59", 22), ("18:00", "18:29", 15),
]
_GBG_TARIFF = [
    ("06:00", "06:29",  9), ("06:30", "06:59", 16), ("07:00", "07:59", 22),
    ("08:00", "08:29", 16), ("08:30", "14:59",  9), ("15:00", "15:29", 16),
    ("15:30", "16:59", 22), ("17:00", "17:59", 16), ("18:00", "18:29",  9),
]


def get_amount(station: dict, local_dt: datetime) -> Tuple[int, bool]:
    """
    Returnerar (belopp_sek, is_high_traffic).
    Returnerar (0, False) om skattefri tidpunkt/dag.
    """
    if not is_taxable_day(local_dt):
        return 0, False
    minute = local_dt.hour * 60 + local_dt.minute
    city = station["city"]
    zone = station.get("zone", "")
    if city == "Stockholm":
        peak = _is_stockholm_peak(local_dt.date())
        if zone == "essingeleden":
            slots = _STH_ESSING_PEAK if peak else _STH_ESSING_LOW
            high_threshold = 40 if peak else 30
        else:
            slots = _STH_INNER_PEAK if peak else _STH_INNER_LOW
            high_threshold = 45 if peak else 35
        amount = _lookup_tariff(slots, minute)
        return amount, amount >= high_threshold
    if city == "Gothenburg":
        amount = _lookup_tariff(_GBG_TARIFF, minute)
        return amount, amount >= 22
    return 0, False


# ── Stationsdata ─────────────────────────────────────────────────────────────

STATIONS: List[Dict] = [
    # ── Stockholm innerstad ──────────────────────────────────────────────────
    {"name": "Ropsten",              "city": "Stockholm", "zone": "innercity",    "lat": 59.35675, "lng": 18.10499},
    {"name": "Värtan",               "city": "Stockholm", "zone": "innercity",    "lat": 59.35143, "lng": 18.09639},
    {"name": "Roslagstull",          "city": "Stockholm", "zone": "innercity",    "lat": 59.35264, "lng": 18.05841},
    {"name": "Frescati",             "city": "Stockholm", "zone": "innercity",    "lat": 59.36562, "lng": 18.05247},
    {"name": "Universitetet",        "city": "Stockholm", "zone": "innercity",    "lat": 59.36298, "lng": 18.05468},
    {"name": "Ekhagen",              "city": "Stockholm", "zone": "innercity",    "lat": 59.36969, "lng": 18.05083},
    {"name": "Solnabron",            "city": "Stockholm", "zone": "innercity",    "lat": 59.34676, "lng": 18.03208},
    {"name": "Gävlegatan",           "city": "Stockholm", "zone": "innercity",    "lat": 59.34758, "lng": 18.03317},
    {"name": "Karlberg",             "city": "Stockholm", "zone": "innercity",    "lat": 59.34376, "lng": 18.02593},
    {"name": "Klarastrandsleden",    "city": "Stockholm", "zone": "innercity",    "lat": 59.33874, "lng": 18.02993},
    {"name": "Ekelundsbron",         "city": "Stockholm", "zone": "innercity",    "lat": 59.34073, "lng": 18.01296},
    {"name": "Lilla Essingen",       "city": "Stockholm", "zone": "innercity",    "lat": 59.32512, "lng": 18.00397},
    {"name": "Stora Essingen",       "city": "Stockholm", "zone": "innercity",    "lat": 59.32253, "lng": 17.99663},
    {"name": "Liljeholmsbron",       "city": "Stockholm", "zone": "innercity",    "lat": 59.31155, "lng": 18.02896},
    {"name": "Skansbron",            "city": "Stockholm", "zone": "innercity",    "lat": 59.30402, "lng": 18.07945},
    {"name": "Johanneshovsbron",     "city": "Stockholm", "zone": "innercity",    "lat": 59.30373, "lng": 18.07717},
    # ── Stockholm Essingeleden (E4) ──────────────────────────────────────────
    {"name": "Fredhäll",             "city": "Stockholm", "zone": "essingeleden", "lat": 59.33148, "lng": 18.01081},
    {"name": "Kristineberg",         "city": "Stockholm", "zone": "essingeleden", "lat": 59.33506, "lng": 18.01018},
    # ── Göteborg ─────────────────────────────────────────────────────────────
    {"name": "Fridkullagatan",       "city": "Gothenburg", "zone": "gbg", "lat": 57.68243, "lng": 11.98762},
    {"name": "Gibraltargatan",       "city": "Gothenburg", "zone": "gbg", "lat": 57.68298, "lng": 11.98449},
    {"name": "Doktor Allards Gata",  "city": "Gothenburg", "zone": "gbg", "lat": 57.68156, "lng": 11.97867},
    {"name": "Ehrenströmsgatan",     "city": "Gothenburg", "zone": "gbg", "lat": 57.67918, "lng": 11.96868},
    {"name": "Dag Hammarskjöldsleden","city": "Gothenburg","zone": "gbg", "lat": 57.67805, "lng": 11.94219},
    {"name": "Margretebergsgatan",   "city": "Gothenburg", "zone": "gbg", "lat": 57.68084, "lng": 11.94324},
    {"name": "Fjällgatan",           "city": "Gothenburg", "zone": "gbg", "lat": 57.69614, "lng": 11.94561},
    {"name": "Stigbergsliden",       "city": "Gothenburg", "zone": "gbg", "lat": 57.69944, "lng": 11.93684},
    {"name": "Oscarsleden",          "city": "Gothenburg", "zone": "gbg", "lat": 57.69997, "lng": 11.93587},
    {"name": "Emigrantvägen",        "city": "Gothenburg", "zone": "gbg", "lat": 57.70014, "lng": 11.93583},
    {"name": "Älvsborgsbron",        "city": "Gothenburg", "zone": "gbg", "lat": 57.69481, "lng": 11.89905},
    {"name": "Lindholmsallén",       "city": "Gothenburg", "zone": "gbg", "lat": 57.70780, "lng": 11.93558},
    {"name": "Karlavagnsgatan västra","city": "Gothenburg","zone": "gbg", "lat": 57.70826, "lng": 11.93522},
    {"name": "Polstjärnegatan",      "city": "Gothenburg", "zone": "gbg", "lat": 57.71057, "lng": 11.93648},
    {"name": "Karlavagnsgatan östra","city": "Gothenburg", "zone": "gbg", "lat": 57.71189, "lng": 11.94292},
    {"name": "Hjalmar Brantingsgatan","city": "Gothenburg","zone": "gbg", "lat": 57.72023, "lng": 11.95806},
    {"name": "Mölndalsvägen",        "city": "Gothenburg", "zone": "gbg", "lat": 57.68507, "lng": 11.99952},
    {"name": "Örgrytevägen",         "city": "Gothenburg", "zone": "gbg", "lat": 57.69788, "lng": 11.99725},
    {"name": "Willinsbron",          "city": "Gothenburg", "zone": "gbg", "lat": 57.70930, "lng": 11.99703},
    {"name": "Redbergsvägen",        "city": "Gothenburg", "zone": "gbg", "lat": 57.71409, "lng": 11.99485},
    {"name": "Olskroksmotet E20",    "city": "Gothenburg", "zone": "gbg", "lat": 57.71523, "lng": 11.99510},
    {"name": "Alingsåsleden",        "city": "Gothenburg", "zone": "gbg", "lat": 57.71674, "lng": 11.99703},
    {"name": "Partihandelsgatan",    "city": "Gothenburg", "zone": "gbg", "lat": 57.71860, "lng": 11.99454},
    {"name": "Marieholmsleden",      "city": "Gothenburg", "zone": "gbg", "lat": 57.71997, "lng": 11.99381},
    {"name": "Marieholmsgatan",      "city": "Gothenburg", "zone": "gbg", "lat": 57.72074, "lng": 11.99077},
    {"name": "Salsmästaregatan",     "city": "Gothenburg", "zone": "gbg", "lat": 57.72402, "lng": 11.98464},
    {"name": "Ringömotet",           "city": "Gothenburg", "zone": "gbg", "lat": 57.72389, "lng": 11.98404},
    {"name": "Tingstadsmotet",       "city": "Gothenburg", "zone": "gbg", "lat": 57.73201, "lng": 11.98332},
    {"name": "Tingstadsvägen",       "city": "Gothenburg", "zone": "gbg", "lat": 57.73097, "lng": 11.98231},
    {"name": "Backadalen",           "city": "Gothenburg", "zone": "gbg", "lat": 57.74758, "lng": 11.98897},
    {"name": "Skälltorpsvägen",      "city": "Gothenburg", "zone": "gbg", "lat": 57.75822, "lng": 11.98971},
    {"name": "Södra Tagenevägen",    "city": "Gothenburg", "zone": "gbg", "lat": 57.75937, "lng": 11.98877},
    {"name": "Backavägen",           "city": "Gothenburg", "zone": "gbg", "lat": 57.72667, "lng": 11.96050},
    {"name": "Lundbyleden",          "city": "Gothenburg", "zone": "gbg", "lat": 57.72707, "lng": 11.97109},
    {"name": "Deltavägen",           "city": "Gothenburg", "zone": "gbg", "lat": 57.72849, "lng": 11.95422},
    {"name": "Minelundsvägen",       "city": "Gothenburg", "zone": "gbg", "lat": 57.72971, "lng": 11.95298},
    {"name": "Tuvevägen",            "city": "Gothenburg", "zone": "gbg", "lat": 57.73891, "lng": 11.94151},
    {"name": "Bäcktuvevägen",        "city": "Gothenburg", "zone": "gbg", "lat": 57.73888, "lng": 11.94102},
]

# ── Detektering ───────────────────────────────────────────────────────────────

# 60 m räcker för 30s-intervall upp till ~100 km/h tack vare segmentinterpolation.
# Smalare radie minskar falskt positiva träffar vid tätt liggande stationer.
PASSAGE_RADIUS_M = 60

# Dagtak per stad (SEK) — fordon betalar högst detta per 24-timmarsdygn
DAILY_MAX_SEK = {
    "Gothenburg": 60,
    "Stockholm":  135,
}


def detect_passages(gps_points: List[Dict]) -> List[Dict]:
    """
    Detekterar trängselskattpassager längs ett GPS-spår.

    gps_points: [{"ts": datetime (UTC) eller ISO-sträng, "lat": float, "lng": float}, ...]
    Returnerar: [{"station": dict, "passage_time": datetime(UTC),
                  "amount_sek": int, "is_high_traffic": bool}, ...]

    Dubbeldetektion inom DEDUP_RADIUS_M / DEDUP_MINUTES filtreras bort
    (täta stationpar som Olskroksmotet + Redbergsvägen).
    """
    from zoneinfo import ZoneInfo

    DEDUP_RADIUS_M   = 200   # stationer inom 200 m räknas som samma passage
    DEDUP_MINUTES    = 5     # …och inom 5 minuter av varandra

    if not gps_points:
        return []

    def _parse(ts):
        if isinstance(ts, str):
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        else:
            dt = ts
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    pts = [
        {"ts": _parse(p["ts"]), "lat": float(p["lat"]), "lng": float(p["lng"])}
        for p in gps_points
        if p.get("lat") is not None and p.get("lng") is not None
    ]
    if not pts:
        return []

    tz = ZoneInfo("Europe/Stockholm")
    raw = []

    for station in STATIONS:
        slat, slng = station["lat"], station["lng"]
        for i in range(len(pts)):
            if i == 0:
                dist = _haversine_m(pts[0]["lat"], pts[0]["lng"], slat, slng)
                passage_ts = pts[0]["ts"]
            else:
                a, b = pts[i - 1], pts[i]
                dist, t = _dist_and_t_to_segment(slat, slng, a["lat"], a["lng"], b["lat"], b["lng"])
                passage_ts = a["ts"] + (b["ts"] - a["ts"]) * t

            if dist <= PASSAGE_RADIUS_M:
                local_ts = passage_ts.astimezone(tz)
                amount, high_traffic = get_amount(station, local_ts)
                if amount > 0:
                    raw.append({
                        "station":         station,
                        "passage_time":    passage_ts,
                        "amount_sek":      amount,
                        "is_high_traffic": high_traffic,
                    })
                break  # en detektion per station per resa

    # ── Deduplicera tätt liggande stationer ────────────────────────────────
    # Behåll den som detekterades tidigast; droppa överlappande.
    raw.sort(key=lambda p: p["passage_time"])
    detected: List[Dict] = []
    for candidate in raw:
        clat = candidate["station"]["lat"]
        clng = candidate["station"]["lng"]
        ct   = candidate["passage_time"]
        duplicate = False
        for kept in detected:
            klat = kept["station"]["lat"]
            klng = kept["station"]["lng"]
            kt   = kept["passage_time"]
            if (_haversine_m(clat, clng, klat, klng) <= DEDUP_RADIUS_M
                    and abs((ct - kt).total_seconds()) <= DEDUP_MINUTES * 60):
                duplicate = True
                break
        if not duplicate:
            detected.append(candidate)

    return detected


# ── Självtest ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    errors = 0

    # Test 1: Passage vid Liljeholmsbron Stockholm, tisdag högsäsong 06:00 UTC = 07:00 CET -> 45 kr
    # Punkterna omringar station (59.31155, 18.02896) på båda sidor
    t1_pts = [
        {"ts": datetime(2026, 3, 17, 6, 0, tzinfo=timezone.utc),  "lat": 59.315, "lng": 18.020},
        {"ts": datetime(2026, 3, 17, 6, 1, tzinfo=timezone.utc),  "lat": 59.311, "lng": 18.029},
        {"ts": datetime(2026, 3, 17, 6, 2, tzinfo=timezone.utc),  "lat": 59.308, "lng": 18.038},
    ]
    t1 = detect_passages(t1_pts)
    assert len(t1) >= 1, f"Test 1 misslyckades: förväntade ≥1 passage, fick {len(t1)}"
    lhb = next((p for p in t1 if p["station"]["name"] == "Liljeholmsbron"), None)
    assert lhb is not None, "Test 1: Liljeholmsbron inte detekterad"
    assert lhb["amount_sek"] == 45, f"Test 1: Fel belopp {lhb['amount_sek']} SEK (förväntat 45)"
    assert lhb["is_high_traffic"] is True, "Test 1: Ska vara högtrafik"
    print(f"[OK] Test 1: Liljeholmsbron {lhb['amount_sek']} kr, högtrafik={lhb['is_high_traffic']}")

    # Test 2: Juli — ingen skatt
    t2_pts = [
        {"ts": datetime(2026, 7, 1, 5, 44, tzinfo=timezone.utc), "lat": 59.315, "lng": 18.020},
        {"ts": datetime(2026, 7, 1, 5, 45, tzinfo=timezone.utc), "lat": 59.311, "lng": 18.029},
    ]
    t2 = detect_passages(t2_pts)
    assert len(t2) == 0, f"Test 2 misslyckades: juli ska ge 0 passager, fick {len(t2)}"
    print(f"[OK] Test 2: Juli -> 0 passager")

    # Test 3: Lördag — ingen skatt
    t3_pts = [
        {"ts": datetime(2026, 3, 14, 5, 44, tzinfo=timezone.utc), "lat": 59.315, "lng": 18.020},
        {"ts": datetime(2026, 3, 14, 5, 45, tzinfo=timezone.utc), "lat": 59.311, "lng": 18.029},
    ]
    t3 = detect_passages(t3_pts)
    assert len(t3) == 0, f"Test 3 misslyckades: lördag ska ge 0 passager, fick {len(t3)}"
    print(f"[OK] Test 3: Lördag -> 0 passager")

    # Test 4: Göteborg, Mölndalsvägen (57.68507, 11.99952), vardag 07:00 CET = 06:00 UTC -> 22 kr
    t4_pts = [
        {"ts": datetime(2026, 3, 17, 6,  0, tzinfo=timezone.utc), "lat": 57.690, "lng": 11.995},
        {"ts": datetime(2026, 3, 17, 6,  1, tzinfo=timezone.utc), "lat": 57.685, "lng": 11.999},
        {"ts": datetime(2026, 3, 17, 6,  2, tzinfo=timezone.utc), "lat": 57.682, "lng": 12.003},
    ]
    t4 = detect_passages(t4_pts)
    mol = next((p for p in t4 if p["station"]["name"] == "Mölndalsvägen"), None)
    assert mol is not None, f"Test 4: Mölndalsvägen inte detekterad. Passager: {[p['station']['name'] for p in t4]}"
    assert mol["amount_sek"] == 22, f"Test 4: Fel belopp {mol['amount_sek']} SEK (förväntat 22)"
    print(f"[OK] Test 4: Mölndalsvägen Göteborg {mol['amount_sek']} kr, högtrafik={mol['is_high_traffic']}")

    # Test 5: Tomt GPS-spår
    t5 = detect_passages([])
    assert len(t5) == 0, "Test 5: Tomt spår ska ge 0 passager"
    print(f"[OK] Test 5: Tomt GPS-spår -> 0 passager")

    # Test 6: Passage utanför skattetid — 22:00 UTC = 23:00 CET -> ingen skatt
    t6_pts = [
        {"ts": datetime(2026, 3, 17, 21, 0, tzinfo=timezone.utc),  "lat": 59.315, "lng": 18.020},
        {"ts": datetime(2026, 3, 17, 21, 1, tzinfo=timezone.utc),  "lat": 59.311, "lng": 18.029},
    ]
    t6 = detect_passages(t6_pts)
    assert len(t6) == 0, f"Test 6: Passage 23:00 lokal ska ge 0, fick {len(t6)}"
    print(f"[OK] Test 6: Passage 23:00 lokal -> 0 passager")

    if errors:
        print(f"\n{errors} test(er) MISSLYCKADES", file=sys.stderr)
        sys.exit(1)
    print(f"\nAlla 6 tester godkända. {len(STATIONS)} stationer laddade.")
