"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatCard from "@/components/StatCard";
import GeoAddress from "@/components/GeoAddress";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function DashboardPage() {
  const supabase = createSupabaseBrowserClient();
  const [stats, setStats] = useState({
    totalTrips: 0,
    totalDistance: 0,
    businessTrips: 0,
    businessDistance: 0,
    privateTrips: 0,
    activeVehicles: 0,
    monthTrips: 0,
    monthDistance: 0,
  });
  const [recentTrips, setRecentTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      const [tripsRes, vehiclesRes] = await Promise.all([
        supabase
          .from("trips")
          .select("id, trip_type, distance_km, date, start_time, start_address, end_address, odometer_start, odometer_end, status, profiles(full_name), vehicles(registration_number)")
          .eq("status", "completed")
          .order("date", { ascending: false })
          .order("start_time", { ascending: false, nullsFirst: false }),
        supabase.from("vehicles").select("id").eq("is_active", true),
      ]);

      const trips = tripsRes.data ?? [];
      const vehicles = vehiclesRes.data ?? [];

      const tripDist = (t: any) =>
        t.distance_km ?? (t.odometer_end && t.odometer_start ? t.odometer_end - t.odometer_start : 0);

      const business = trips.filter((t) => t.trip_type === "business");
      const totalDist = trips.reduce((s, t) => s + tripDist(t), 0);
      const businessDist = business.reduce((s, t) => s + tripDist(t), 0);

      const thisMonth = trips.filter((t) => {
        const d = new Date(t.date);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      const monthDist = thisMonth.reduce((s, t) => s + tripDist(t), 0);

      setStats({
        totalTrips: trips.length,
        totalDistance: Math.round(totalDist),
        businessTrips: business.length,
        businessDistance: Math.round(businessDist),
        privateTrips: trips.length - business.length,
        activeVehicles: vehicles.length,
        monthTrips: thisMonth.length,
        monthDistance: Math.round(monthDist),
      });
      setRecentTrips(trips.slice(0, 10));
      setLoading(false);
    }
    load();
  }, []);

  const monthName = new Date().toLocaleString("sv-SE", { month: "long" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Översikt av alla resor och fordon</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Antal resor"
          value={loading ? "–" : stats.totalTrips}
          subtitle={loading ? "" : `${stats.monthTrips} st i ${monthName}`}
          color="blue"
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
            </svg>
          }
        />
        <StatCard
          title="Total distans"
          value={loading ? "–" : `${stats.totalDistance.toLocaleString("sv-SE")} km`}
          subtitle={loading ? "" : `${stats.monthDistance.toLocaleString("sv-SE")} km i ${monthName}`}
          color="green"
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
            </svg>
          }
        />
        <StatCard
          title="Tjänsteresor"
          value={loading ? "–" : stats.businessTrips}
          subtitle={
            stats.totalTrips > 0
              ? `${Math.round((stats.businessTrips / stats.totalTrips) * 100)}% av resor · ${stats.totalDistance > 0 ? Math.round((stats.businessDistance / stats.totalDistance) * 100) : 0}% av km`
              : "Inga resor än"
          }
          color="purple"
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z" />
            </svg>
          }
        />
        <StatCard
          title="Aktiva fordon"
          value={loading ? "–" : stats.activeVehicles}
          subtitle="Registrerade fordon"
          color="amber"
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          }
        />
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Senaste resor</h2>
          <a href="/trips" className="text-sm font-medium text-primary-600 hover:text-primary-800">Visa alla &rarr;</a>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400">Laddar...</div>
        ) : recentTrips.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">Inga resor registrerade ännu</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-3">Datum</th>
                  <th className="px-4 py-3">Fordon</th>
                  <th className="px-4 py-3">Från → Till</th>
                  <th className="px-4 py-3">Distans</th>
                  <th className="px-4 py-3">Typ</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentTrips.map((trip) => {
                  const dist = trip.distance_km ?? (trip.odometer_end && trip.odometer_start ? trip.odometer_end - trip.odometer_start : null);
                  return (
                    <tr key={trip.id} className="transition-colors hover:bg-gray-50">
                      <td className="table-cell font-medium">
                        <div>{trip.date}</div>
                        {trip.start_time && (
                          <div className="text-xs text-gray-400 font-normal">
                            {new Date(trip.start_time).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        )}
                      </td>
                      <td className="table-cell font-mono text-xs">{(trip.vehicles as any)?.registration_number ?? "–"}</td>
                      <td className="table-cell">
                        <span className="text-gray-500"><GeoAddress address={trip.start_address} /></span>
                        <span className="mx-1.5 text-gray-300">&rarr;</span>
                        <span><GeoAddress address={trip.end_address} /></span>
                      </td>
                      <td className="table-cell font-medium">{dist != null ? `${Math.round(dist)} km` : "–"}</td>
                      <td className="table-cell">
                        <span className={trip.trip_type === "business" ? "badge-business" : "badge-private"}>
                          {trip.trip_type === "business" ? "Tjänst" : "Privat"}
                        </span>
                      </td>
                      <td className="table-cell">
                        <Link href={`/trips/${trip.id}`} className="text-sm font-medium text-primary-600 hover:text-primary-800">
                          Visa
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
