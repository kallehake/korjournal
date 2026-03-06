"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import StatCard from "@/components/StatCard";

// Mock data - replace with TanStack Query + Supabase calls
const mockMonthlyData = [
  { month: "Jan", resor: 42 },
  { month: "Feb", resor: 38 },
  { month: "Mar", resor: 55 },
  { month: "Apr", resor: 48 },
  { month: "Maj", resor: 62 },
  { month: "Jun", resor: 51 },
  { month: "Jul", resor: 28 },
  { month: "Aug", resor: 45 },
  { month: "Sep", resor: 58 },
  { month: "Okt", resor: 64 },
  { month: "Nov", resor: 53 },
  { month: "Dec", resor: 40 },
];

const mockTripTypeData = [
  { name: "Tjänsteresor", value: 412, color: "#2563eb" },
  { name: "Privatresor", value: 172, color: "#f59e0b" },
];

export default function DashboardPage() {
  const stats = useMemo(
    () => ({
      totalTrips: 584,
      totalDistance: 48250,
      businessTrips: 412,
      privateTrips: 172,
      activeVehicles: 12,
      activeDrivers: 8,
    }),
    []
  );

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Översikt av alla resor och fordon
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Totalt antal resor"
          value={stats.totalTrips}
          subtitle="Denna period"
          color="blue"
          trend={{ value: 12, label: "jmf förra månaden" }}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
            </svg>
          }
        />
        <StatCard
          title="Total distans"
          value={`${stats.totalDistance.toLocaleString("sv-SE")} km`}
          subtitle="Totalt körda kilometer"
          color="green"
          trend={{ value: 8, label: "jmf förra månaden" }}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
            </svg>
          }
        />
        <StatCard
          title="Tjänsteresor"
          value={stats.businessTrips}
          subtitle={`${Math.round((stats.businessTrips / stats.totalTrips) * 100)}% av alla resor`}
          color="purple"
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z" />
            </svg>
          }
        />
        <StatCard
          title="Aktiva fordon"
          value={stats.activeVehicles}
          subtitle={`${stats.activeDrivers} aktiva förare`}
          color="amber"
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          }
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Bar chart - Trips per month */}
        <div className="card lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Resor per månad
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockMonthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                  }}
                  formatter={(value: number) => [`${value} resor`, "Antal"]}
                />
                <Bar
                  dataKey="resor"
                  fill="#2563eb"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie chart - Trip types */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Fördelning restyp
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={mockTripTypeData}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {mockTripTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`${value} resor`, "Antal"]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  formatter={(value) => (
                    <span className="text-sm text-gray-600">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent trips */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Senaste resor
          </h2>
          <a
            href="/trips"
            className="text-sm font-medium text-primary-600 hover:text-primary-800"
          >
            Visa alla &rarr;
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3">Datum</th>
                <th className="px-4 py-3">Förare</th>
                <th className="px-4 py-3">Fordon</th>
                <th className="px-4 py-3">Sträcka</th>
                <th className="px-4 py-3">Distans</th>
                <th className="px-4 py-3">Typ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                { date: "2026-02-13", driver: "Anna Svensson", vehicle: "ABC 123", from: "Stockholm", to: "Uppsala", km: 72, type: "business" },
                { date: "2026-02-12", driver: "Erik Johansson", vehicle: "DEF 456", from: "Göteborg", to: "Borås", km: 65, type: "business" },
                { date: "2026-02-12", driver: "Maria Lindberg", vehicle: "GHI 789", from: "Malmö", to: "Lund", km: 18, type: "private" },
                { date: "2026-02-11", driver: "Anna Svensson", vehicle: "ABC 123", from: "Uppsala", to: "Stockholm", km: 72, type: "business" },
                { date: "2026-02-11", driver: "Karl Nilsson", vehicle: "JKL 012", from: "Linköping", to: "Norrköping", km: 45, type: "business" },
              ].map((trip, i) => (
                <tr key={i} className="transition-colors hover:bg-gray-50">
                  <td className="table-cell font-medium">{trip.date}</td>
                  <td className="table-cell">{trip.driver}</td>
                  <td className="table-cell font-mono text-xs">{trip.vehicle}</td>
                  <td className="table-cell">
                    <span className="text-gray-500">{trip.from}</span>
                    <span className="mx-1.5 text-gray-300">&rarr;</span>
                    <span>{trip.to}</span>
                  </td>
                  <td className="table-cell font-medium">{trip.km} km</td>
                  <td className="table-cell">
                    <span className={trip.type === "business" ? "badge-business" : "badge-private"}>
                      {trip.type === "business" ? "Tjänst" : "Privat"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
