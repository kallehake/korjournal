"""
BYD cloud poller — körs var 5:e minut via GitHub Actions.
Loopar i 4 minuter med 30 sekunders intervall → ~8 GPS-punkter per körning.
"""
import asyncio
import json
import math
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple

from pybyd.client import BydClient
from pybyd.config import BydConfig
from supabase import create_client, Client

BYD_EMAIL    = os.environ["BYD_EMAIL"]
BYD_PASSWORD = os.environ["BYD_PASSWORD"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

SPEED_START_KMH  = 5.0
MAX_TRIP_AGE_H   = 24
LOOP_SECONDS     = 240   # kör i 4 minuter
POLL_INTERVAL_S  = 30    # sekunder mellan varje poll


def sb() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def geocode(lat, lng) -> str:
    """Reverse geocoding via Nominatim. Fallback till koordinatsträng."""
    if not lat or not lng:
        return "Okänd position"
    try:
        url = (
            f"https://nominatim.openstreetmap.org/reverse"
            f"?format=json&lat={lat}&lon={lng}&accept-language=sv"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "Korjournal/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        addr = data.get("address", {})
        road = addr.get("road", "")
        city = (
            addr.get("city")
            or addr.get("town")
            or addr.get("village")
            or addr.get("municipality", "")
        )
        if road and city:
            return f"{road}, {city}"
        return city or f"{lat:.4f}, {lng:.4f}"
    except Exception:
        return f"{lat:.4f}, {lng:.4f}"


def _dist_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Avstånd i meter mellan två GPS-koordinater (Haversine)."""
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_trip_type_from_geofence(database: Client, org_id: str, lat: float, lng: float) -> str:
    """Returnerar auto_trip_type från matchande geofence, annars 'private'."""
    resp = (database.table("geofences")
        .select("auto_trip_type, latitude, longitude, radius_meters")
        .eq("organization_id", org_id)
        .eq("is_active", True)
        .not_.is_("auto_trip_type", "null")
        .execute())
    if not resp or not resp.data:
        return "private"
    for gf in resp.data:
        if _dist_m(lat, lng, gf["latitude"], gf["longitude"]) <= gf["radius_meters"]:
            print(f"  Geofence-match: {gf['auto_trip_type']}")
            return gf["auto_trip_type"]
    return "private"


def get_active_trip(database: Client, vehicle_id: str) -> Optional[dict]:
    cutoff = (now_utc() - timedelta(hours=MAX_TRIP_AGE_H)).isoformat()
    resp = (database.table("trips")
        .select("id, odometer_start, start_lat, start_lng, start_time")
        .eq("vehicle_id", vehicle_id)
        .is_("end_time", "null")
        .gte("start_time", cutoff)
        .order("start_time", desc=True)
        .limit(1)
        .execute())
    return resp.data[0] if resp and resp.data else None


def get_last_trip_end(database: Client, vehicle_id: str) -> Optional[Tuple[float, float]]:
    """Senaste avslutade resans slutposition — används som startpunkt om bilen precis börjat köra."""
    resp = (database.table("trips")
        .select("end_lat, end_lng")
        .eq("vehicle_id", vehicle_id)
        .eq("status", "completed")
        .not_.is_("end_lat", "null")
        .order("end_time", desc=True)
        .limit(1)
        .execute())
    if resp and resp.data:
        return resp.data[0]["end_lat"], resp.data[0]["end_lng"]
    return None


def is_polling_hours() -> bool:
    """
    Tillåter polling vardagar 05:30–22:30 och helger 07:00–22:00 (svensk tid).
    Utanför dessa tider lämnas bilen ifred så att den kan sova.
    """
    from zoneinfo import ZoneInfo
    now_local = datetime.now(ZoneInfo("Europe/Stockholm"))
    weekday = now_local.weekday()   # 0=mån … 6=sön
    hm = now_local.hour * 60 + now_local.minute
    if weekday < 5:   # måndag–fredag
        return 5 * 60 + 30 <= hm <= 22 * 60 + 30
    else:             # lördag–söndag
        return 7 * 60 <= hm <= 22 * 60


async def run():
    if not is_polling_hours():
        print("Utanför körtid — polling pausad för att låta bilen sova.")
        return

    database = sb()

    config = BydConfig(
        username=BYD_EMAIL,
        password=BYD_PASSWORD,
        country_code="SE",
        language="sv",
        time_zone="Europe/Stockholm",
        mqtt_enabled=False,
    )

    async with BydClient(config) as client:
        await client.login()
        byd_vehicles = await client.get_vehicles()

        if not byd_vehicles:
            print("Inga BYD-fordon hittades.", file=sys.stderr)
            return

        byd_vehicle = byd_vehicles[0]
        vin   = byd_vehicle.vin
        plate = byd_vehicle.auto_plate
        print(f"Fordon: {vin} ({plate})")

        # Hämta fordon och förare en gång
        veh_resp = (database.table("vehicles")
            .select("id, organization_id")
            .ilike("registration_number", plate.replace(" ", ""))
            .eq("is_active", True)
            .limit(1)
            .execute())

        if not veh_resp.data:
            print(f"Fordon {plate} finns ej i Supabase.", file=sys.stderr)
            return

        vehicle_id = veh_resp.data[0]["id"]
        org_id     = veh_resp.data[0]["organization_id"]

        driver_resp = (database.table("profiles")
            .select("id")
            .eq("organization_id", org_id)
            .order("created_at")
            .limit(1)
            .execute())

        if not driver_resp.data:
            print("Ingen förare hittades.", file=sys.stderr)
            return

        driver_id = driver_resp.data[0]["id"]

        # ── Pollingsloop ──────────────────────────────────────────────────────
        loop_start  = time.monotonic()
        prev_lat    = None
        prev_lng    = None
        prev_moving = False
        iteration   = 0

        while True:
            elapsed = time.monotonic() - loop_start
            if elapsed >= LOOP_SECONDS:
                break

            iteration += 1
            print(f"\n── Iteration {iteration} ({int(elapsed)}s) ──")

            try:
                rt  = await client.get_vehicle_realtime(vin)
                gps = await client.get_gps_info(vin)
            except Exception as e:
                print(f"API-fel: {e}", file=sys.stderr)
                await asyncio.sleep(POLL_INTERVAL_S)
                continue

            speed_kmh = rt.speed        if rt.speed        is not None else 0.0
            odometer  = rt.total_mileage if rt.total_mileage is not None else 0.0
            lat       = gps.latitude
            lng       = gps.longitude
            gps_ts    = gps.gps_timestamp or now_utc()

            print(f"  {speed_kmh:.1f} km/h | {odometer:.0f} km | {lat},{lng}")

            # Uppdatera fordonets aktuella mätarställning
            if odometer > 0:
                database.table("vehicles").update({
                    "current_odometer": round(odometer),
                }).eq("id", vehicle_id).execute()

            moving       = speed_kmh >= SPEED_START_KMH
            active_trip  = get_active_trip(database, vehicle_id)
            active_trip_id = active_trip["id"] if active_trip else None

            if moving:
                if not active_trip_id:
                    # Bil precis börjat köra — använd föregående position som startpunkt
                    if prev_lat and not prev_moving:
                        start_lat = prev_lat
                        start_lng = prev_lng
                    elif not prev_moving:
                        # Första iterationen och redan rörlig — ta sista resans slutpunkt
                        last_end = get_last_trip_end(database, vehicle_id)
                        start_lat = last_end[0] if last_end else lat
                        start_lng = last_end[1] if last_end else lng
                    else:
                        start_lat, start_lng = lat, lng

                    trip = database.table("trips").insert({
                        "organization_id": org_id,
                        "vehicle_id":      vehicle_id,
                        "driver_id":       driver_id,
                        "start_time":      gps_ts.isoformat(),
                        "start_address":   geocode(start_lat, start_lng),
                        "start_lat":       start_lat,
                        "start_lng":       start_lng,
                        "odometer_start":  round(odometer),
                        "trip_type":       "private",
                    }).execute()
                    active_trip_id = trip.data[0]["id"]
                    print(f"  Resa startad: {active_trip_id}")
                else:
                    database.table("gps_points").insert({
                        "trip_id":   active_trip_id,
                        "timestamp": gps_ts.isoformat(),
                        "latitude":  lat,
                        "longitude": lng,
                        "speed":     round(speed_kmh / 3.6, 2),
                    }).execute()
                    print(f"  GPS-punkt sparad")

            else:
                if active_trip_id:
                    trip_type = get_trip_type_from_geofence(database, org_id, lat, lng)
                    database.table("trips").update({
                        "end_time":     gps_ts.isoformat(),
                        "end_lat":      lat,
                        "end_lng":      lng,
                        "end_address":  geocode(lat, lng),
                        "odometer_end": round(odometer),
                        "status":       "completed",
                        "trip_type":    trip_type,
                    }).eq("id", active_trip_id).execute()
                    km = odometer - (active_trip.get("odometer_start") or odometer)
                    print(f"  Resa avslutad | Distans: {km:.0f} km")

                    # ── Trängselskatt-detektion ───────────────────────────
                    try:
                        from congestion_stations import detect_passages
                        gps_resp = (database.table("gps_points")
                            .select("timestamp, latitude, longitude")
                            .eq("trip_id", active_trip_id)
                            .order("timestamp")
                            .execute())
                        gps_track = []
                        if active_trip.get("start_lat"):
                            gps_track.append({
                                "ts":  active_trip["start_time"],
                                "lat": active_trip["start_lat"],
                                "lng": active_trip["start_lng"],
                            })
                        for gp in (gps_resp.data or []):
                            gps_track.append({
                                "ts":  gp["timestamp"],
                                "lat": gp["latitude"],
                                "lng": gp["longitude"],
                            })
                        gps_track.append({"ts": gps_ts.isoformat(), "lat": lat, "lng": lng})

                        passages = detect_passages(gps_track)
                        total_congestion = 0
                        for passage in passages:
                            database.table("congestion_tax_passages").insert({
                                "trip_id":        active_trip_id,
                                "vehicle_id":     vehicle_id,
                                "station_name":   passage["station"]["name"],
                                "city":           passage["station"]["city"],
                                "latitude":       passage["station"]["lat"],
                                "longitude":      passage["station"]["lng"],
                                "passage_time":   passage["passage_time"].isoformat(),
                                "amount_sek":     passage["amount_sek"],
                                "is_high_traffic": passage["is_high_traffic"],
                            }).execute()
                            total_congestion += passage["amount_sek"]
                            print(f"  Trängselskatt: {passage['station']['name']} {passage['amount_sek']} kr")
                        if total_congestion > 0:
                            database.table("trips").update({
                                "congestion_tax_total": total_congestion,
                            }).eq("id", active_trip_id).execute()
                            print(f"  Totalt trängselskatt: {total_congestion} kr")
                    except Exception as cong_err:
                        print(f"  Trängselskatt-detektion misslyckades: {cong_err}", file=sys.stderr)
                else:
                    print("  Bilen är still, ingen aktiv resa.")

            prev_lat    = lat
            prev_lng    = lng
            prev_moving = moving

            # Vänta till nästa poll (men överskrid ej looptiden)
            remaining = LOOP_SECONDS - (time.monotonic() - loop_start)
            if remaining > POLL_INTERVAL_S:
                await asyncio.sleep(POLL_INTERVAL_S)
            elif remaining > 2:
                await asyncio.sleep(remaining)
            else:
                break

    print(f"\nKlar. {iteration} iterationer på {int(time.monotonic() - loop_start)}s.")


if __name__ == "__main__":
    asyncio.run(run())
