"""
Tesla cloud poller — körs var 5:e minut via GitHub Actions.

Hämtar position + hastighet + odometer från Tesla API och loggar resor
i Supabase. Kräver en refresh_token som genereras via get_tesla_token.py.

GitHub Secrets som krävs:
  TESLA_REFRESH_TOKEN  — från get_tesla_token.py
  TESLA_VIN            — fordonets VIN
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from typing import Optional

import teslapy
from supabase import create_client, Client

# ── Konfiguration ──────────────────────────────────────────────────────────────
TESLA_EMAIL         = os.environ.get("TESLA_EMAIL", "")
TESLA_REFRESH_TOKEN = os.environ.get("TESLA_REFRESH_TOKEN", "")
TESLA_VIN           = os.environ.get("TESLA_VIN", "")

if not TESLA_REFRESH_TOKEN or not TESLA_VIN:
    print("TESLA_REFRESH_TOKEN eller TESLA_VIN ej konfigurerat — hoppar över Tesla-polling.")
    sys.exit(0)
SUPABASE_URL        = os.environ["SUPABASE_URL"]
SUPABASE_KEY        = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

SPEED_START_KMH = 5.0
MAX_TRIP_AGE_H  = 24


def sb() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def poll():
    database = sb()

    # ── Hämta data från Tesla ─────────────────────────────────────────────────
    with teslapy.Tesla(TESLA_EMAIL or "korjournal@noreply.se") as tesla:
        # Injicera refresh_token utan interaktiv inloggning
        tesla.token = {"refresh_token": TESLA_REFRESH_TOKEN, "token_type": "Bearer"}

        vehicles = tesla.vehicle_list()
        vehicle = next((v for v in vehicles if v["vin"] == TESLA_VIN), None)

        if not vehicle:
            print(f"Fordon med VIN {TESLA_VIN} hittades inte.", file=sys.stderr)
            return

        print(f"Fordon: {vehicle['display_name']} ({vehicle['vin']})")

        # Väck bilen om den sover
        try:
            vehicle.sync_wake_up()
        except teslapy.VehicleError:
            print("Bilen svarar inte (sover/offline) — hoppar över.")
            return

        data = vehicle.get_vehicle_data()

    drive   = data.get("drive_state", {})
    vehicle_state = data.get("vehicle_state", {})

    speed_kmh = (drive.get("speed") or 0) * 1.60934   # mph → km/h
    odometer  = (vehicle_state.get("odometer") or 0) * 1.60934  # miles → km
    lat       = drive.get("latitude")
    lon       = drive.get("longitude")
    gps_ts    = datetime.fromtimestamp(drive.get("gps_as_of", 0), tz=timezone.utc)

    print(f"Hastighet: {speed_kmh:.1f} km/h | Odometer: {odometer:.0f} km | Pos: {lat},{lon}")

    # ── Hitta fordon i Supabase via VIN ───────────────────────────────────────
    veh_resp = (database.table("vehicles")
        .select("id, organization_id")
        .eq("vin", TESLA_VIN)
        .eq("is_active", True)
        .limit(1)
        .execute())

    if not veh_resp.data:
        # Försök via registreringsnummer om VIN saknas
        plate = vehicle_state.get("vehicle_name", "")
        veh_resp = (database.table("vehicles")
            .select("id, organization_id")
            .ilike("registration_number", plate)
            .eq("is_active", True)
            .limit(1)
            .execute())

    if not veh_resp.data:
        print(f"Fordon med VIN {TESLA_VIN} finns ej i Supabase — lägg till i webbappen.", file=sys.stderr)
        return

    vehicle_id = veh_resp.data[0]["id"]
    org_id     = veh_resp.data[0]["organization_id"]

    # ── Välj förare ───────────────────────────────────────────────────────────
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

    # ── Hitta aktiv resa ──────────────────────────────────────────────────────
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
            trip = database.table("trips").insert({
                "organization_id": org_id,
                "vehicle_id":      vehicle_id,
                "driver_id":       driver_id,
                "start_time":      gps_ts.isoformat(),
                "start_address":   f"{lat:.4f}, {lon:.4f}",  # NOT NULL
                "start_lat":       lat,
                "start_lng":       lon,
                "odometer_start":  round(odometer),           # INTEGER
                "trip_type":       "business",
            }).execute()
            active_trip_id = trip.data[0]["id"]
            print(f"Resa startad: {active_trip_id} | Start: {odometer:.0f} km")
        else:
            database.table("gps_points").insert({
                "trip_id":   active_trip_id,
                "timestamp": gps_ts.isoformat(),
                "latitude":  lat,
                "longitude": lon,
                "speed":     round(speed_kmh / 3.6, 2),       # km/h → m/s
            }).execute()
            print(f"GPS-punkt sparad | Resa: {active_trip_id}")
    else:
        if active_trip_id:
            database.table("trips").update({
                "end_time":     gps_ts.isoformat(),
                "end_lat":      lat,
                "end_lng":      lon,
                "odometer_end": round(odometer),               # INTEGER
            }).eq("id", active_trip_id).execute()
            km = odometer - (active_trip.get("odometer_start") or odometer)
            print(f"Resa avslutad: {active_trip_id} | Distans: {km:.0f} km")
        else:
            print("Bilen är still, ingen aktiv resa.")


if __name__ == "__main__":
    poll()
