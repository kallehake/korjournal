"use client";

import Link from "next/link";
import { useState } from "react";
import GeoAddress from "./GeoAddress";

export interface TripRow {
  id: string;
  date: string;
  start_address: string;
  end_address: string | null;
  odometer_start: number;
  odometer_end: number | null;
  distance_km: number | null;
  trip_type: "business" | "private";
  purpose: string | null;
  status: string;
  driver: { id: string; full_name: string } | null;
  vehicle: { id: string; registration_number: string; make: string | null; model: string | null } | null;
  customer: { id: string; name: string } | null;
}

interface TripTableProps {
  trips: TripRow[];
}

type SortField = "date" | "trip_type" | "distance_km" | "status";
type SortDirection = "asc" | "desc";

export default function TripTable({ trips }: TripTableProps) {
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  }

  const sorted = [...trips].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    let cmp = 0;
    if (typeof aVal === "string" && typeof bVal === "string") cmp = aVal.localeCompare(bVal, "sv");
    else if (typeof aVal === "number" && typeof bVal === "number") cmp = aVal - bVal;
    return sortDirection === "asc" ? cmp : -cmp;
  });

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field)
      return <svg className="ml-1 inline h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" /></svg>;
    return sortDirection === "asc"
      ? <svg className="ml-1 inline h-3.5 w-3.5 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
      : <svg className="ml-1 inline h-3.5 w-3.5 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>;
  }

  if (trips.length === 0) {
    return (
      <div className="card py-12 text-center">
        <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
        </svg>
        <p className="mt-4 text-sm text-gray-500">Inga resor att visa.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr className="table-header">
            <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("date")}>
              Datum <SortIcon field="date" />
            </th>
            <th className="px-4 py-3">Förare</th>
            <th className="px-4 py-3">Reg.nr</th>
            <th className="px-4 py-3">Sträcka</th>
            <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("distance_km")}>
              Distans <SortIcon field="distance_km" />
            </th>
            <th className="cursor-pointer px-4 py-3" onClick={() => handleSort("trip_type")}>
              Typ <SortIcon field="trip_type" />
            </th>
            <th className="px-4 py-3">Syfte</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((trip) => {
            const dist = trip.distance_km ?? (trip.odometer_end && trip.odometer_start ? trip.odometer_end - trip.odometer_start : null);
            return (
              <tr key={trip.id} className="transition-colors hover:bg-gray-50">
                <td className="table-cell font-medium">{trip.date}</td>
                <td className="table-cell">{trip.driver?.full_name ?? "–"}</td>
                <td className="table-cell font-mono text-xs">{trip.vehicle?.registration_number ?? "–"}</td>
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
                <td className="table-cell max-w-[200px] truncate text-gray-500">{trip.purpose ?? "–"}</td>
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
  );
}
