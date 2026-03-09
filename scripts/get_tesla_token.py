"""
Engångsskript för att hämta Tesla refresh_token.
Kör detta lokalt en gång, kopiera token till GitHub Secret TESLA_REFRESH_TOKEN.

Användning:
    pip install teslapy
    python scripts/get_tesla_token.py
"""
import teslapy

EMAIL = input("Tesla-konto e-post: ").strip()

with teslapy.Tesla(EMAIL) as tesla:
    if not tesla.authorized:
        print("\nÖppnar Tesla-inloggning i webbläsaren...")
        tesla.refresh_token(refresh_token=None)

    vehicles = tesla.vehicle_list()
    for v in vehicles:
        print(f"\nFordon: {v['display_name']} | VIN: {v['vin']}")

    # Spara refresh_token
    token = tesla.token.get("refresh_token", "")
    print(f"\n{'='*60}")
    print("Lägg till följande som GitHub Secret 'TESLA_REFRESH_TOKEN':")
    print(f"\n{token}\n")
    print("='*60}")
    print("Och ange VIN som GitHub Secret 'TESLA_VIN':")
    if vehicles:
        print(vehicles[0]["vin"])
