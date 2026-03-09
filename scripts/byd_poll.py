"""
BYD cloud poller — körs var 5:e minut via GitHub Actions.

Hämtar position + hastighet + mätarställning från BYD API och loggar resor
i Supabase. Ingen extra state-tabell behövs — aktiv resa hämtas direkt från
trips-tabellen.

Trip-detektering:
  - Resa startar när speed >= SPEED_START_KMH
  - Resa avslutas när speed < SPEED_START_KMH vid ett poll (5 min intervall
    innebär att kortare stopp på < 5 min inte påverkar resan)
"""
import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from typing import Optional

from pybyd.client import BydClient
from pybyd.config import BydConfig
from supabase import create_client, Client

# ── Konfiguration ──────────────────────────────────────────────────────────────
BYD_EMAIL    = os.environ["BYD_EMAIL"]
BYD_PASSWORD = os.environ["BYD_PASSWORD"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

SPEED_START_KMH = 5.0    # resa startar/fortsätter när hastigheten >= detta
MAX_TRIP_AGE_H  = 24     # öppna resor äldre än detta ignoreras (testdata-skydd)


def sb() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


async def poll():
    database = sb()

    # ── Hämta data från BYD ───────────────────────────────────────────────────
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
        vin         = byd_vehicle.vin
        plate       = byd_vehicle.auto_plate

        print(f"Fordon: {vin} ({plate})")

        rt  = await client.get_vehicle_realtime(vin)
        gps = await client.get_gps_info(vin)

    speed_kmh = rt.speed   if rt.speed   is not None else 0.0
    odometer  = rt.total_mileage if rt.total_mileage is not None else 0.0
    lat       = gps.latitude
    lon       = gps.longitude
    gps_ts    = gps.gps_timestamp or now_utc()

    print(f"Hastighet: {speed_kmh:.1f} km/h | Odometer: {odometer:.0f} km | Pos: {lat},{lon}")

    # ── Hitta fordon i Supabase ────────────────────────────────────────────────
    veh_resp = (database.table("vehicles")
        .select("id, organization_id")
        .ilike("registration_number", plate.replace(" ", ""))
        .eq("is_active", True)
        .limit(1)
        .execute())

    if not veh_resp.data:
        print(f"Fordon {plate} finns ej i Supabase — lägg till i webbappen.", file=sys.stderr)
        return

    vehicle_id = veh_resp.data[0]["id"]
    org_id     = veh_resp.data[0]["organization_id"]

    # ── Välj förare (äldsta profilen i org) ───────────────────────────────────
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

    # ── Hitta aktiv resa (nyare än MAX_TRIP_AGE_H timmar) ────────────────────
    cutoff = (now_utc() - timedelta(hours=MAX_TRIP_AGE_H)).isoformat()
    active_resp = (database.table("trips")
        .select("id, odometer_start")
        .eq("vehicle_id", vehicle_id)
        .is_("end_time", "null")
        .gte("start_time", cutoff)
        .order("start_time", desc=True)
        .limit(1)
        .execute())

    active_trip: Optional[dict] = (active_resp.data[0] if active_resp and active_resp.data else None)
    active_trip_id: Optional[str] = active_trip["id"] if active_trip else None

    # ── Trip-logik ─────────────────────────────────────────────────────────────
    moving = speed_kmh >= SPEED_START_KMH

    if moving:
        if not active_trip_id:
            # Starta ny resa
            trip = database.table("trips").insert({
                "organization_id": org_id,
                "vehicle_id":      vehicle_id,
                "driver_id":       driver_id,
                "start_time":      gps_ts.isoformat(),
                "start_lat":       lat,
                "start_lon":       lon,
                "odometer_start":  odometer,
                "trip_type":       "business",
            }).execute()
            active_trip_id = trip.data[0]["id"]
            print(f"Resa startad: {active_trip_id} | Start: {odometer:.0f} km")
        else:
            # Resa pågår — lägg till GPS-punkt
            database.table("gps_points").insert({
                "trip_id":   active_trip_id,
                "timestamp": gps_ts.isoformat(),
                "latitude":  lat,
                "longitude": lon,
                "speed_kmh": speed_kmh,
            }).execute()
            print(f"GPS-punkt sparad | Resa: {active_trip_id}")

    else:
        # Bilen är still
        if active_trip_id:
            # Avsluta resan
            database.table("trips").update({
                "end_time":     gps_ts.isoformat(),
                "end_lat":      lat,
                "end_lon":      lon,
                "odometer_end": odometer,
            }).eq("id", active_trip_id).execute()
            km = odometer - (active_trip.get("odometer_start") or odometer)
            print(f"Resa avslutad: {active_trip_id} | Distans: {km:.1f} km")
        else:
            print("Bilen är still, ingen aktiv resa.")


if __name__ == "__main__":
    asyncio.run(poll())
