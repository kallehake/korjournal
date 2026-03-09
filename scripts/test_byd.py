import asyncio
from pybyd.client import BydClient
from pybyd.config import BydConfig

EMAIL = "kalle_hake@hotmail.com"
PASSWORD = "Dav!d022"

async def main():
    config = BydConfig(
        username=EMAIL,
        password=PASSWORD,
        country_code="SE",
        language="sv",
        time_zone="Europe/Stockholm",
        mqtt_enabled=False,
    )
    async with BydClient(config) as client:
        print("Loggar in...")
        await client.login()
        print("Inloggad!")
        vehicles = await client.get_vehicles()
        if not vehicles:
            print("Inga fordon kopplade till kontot.")
            return
        for v in vehicles:
            print(f"  Fordon: {v.vin} | {v.auto_plate} | {v.auto_alias}")
        vin = vehicles[0].vin
        rt  = await client.get_vehicle_realtime(vin)
        gps = await client.get_gps_info(vin)
        print(f"Hastighet: {rt.speed} km/h")
        print(f"Odometer:  {rt.total_mileage} km")
        print(f"SOC:       {rt.elec_percent}%")
        print(f"GPS:       {gps.latitude}, {gps.longitude}")
        print(f"GPS-tid:   {gps.gps_timestamp}")

asyncio.run(main())
