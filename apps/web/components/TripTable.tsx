"use client";

import Link from "next/link";
import { useState } from "react";
import GeoAddress from "./GeoAddress";

export interface TripRow {
  id: string;
  date: string;
  start_time?: string | null;
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
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

type SortField = "date" | "trip_type" | "distance_km" | "status";
type SortDirection = "asc" | "desc";

export default function TripTable({ trips, selectedIds, onSelectionChange }: TripTableProps) {
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const selectable = !!onSelectionChange;
  const selected = new Set(selectedIds ?? []);

  const sorted = [...trips].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    let cmp = 0;
    if (typeof aVal === "string" && typeof bVal === "string") cmp = aVal.localeCompare(bVal, "sv");
    else if (typeof aVal === "number" && typeof bVal === "number") cmp = aVal - bVal;
    // Tiebreak on start_time when sorting by date
    if (cmp === 0 && sortField === "date" && a.start_time && b.start_time) {
      cmp = a.start_time.localeCompare(b.start_time);
    }
    return sortDirection === "asc" ? cmp : -cmp;
  });

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  }

  function toggleSelect(id: string) {
    if (!onSelectionChange) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange([...next]);
  }

  function toggleAll() {
    if (!onSelectionChange) return;
    if (selected.size === sorted.length && sorted.length > 0) {
      onSelectionChange([]);
    } else {
      onSelectionChange(sorted.map((t) => t.id));
    }
  }

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

  const allSelected = sorted.length > 0 && selected.size === sorted.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr className="table-header">
            {selectable && (
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                />
              </th>
            )}
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
            const isSelected = selected.has(trip.id);
            return (
              <tr
                key={trip.id}
                className={`transition-colors hover:bg-gray-50 ${isSelected ? "bg-blue-50 hover:bg-blue-100" : ""}`}
              >
                {selectable && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(trip.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    />
                  </td>
                )}
                <td className="table-cell font-medium">
                  <div>{trip.date}</div>
                  {trip.start_time && (
                    <div className="text-xs text-gray-400 font-normal">
                      {new Date(trip.start_time).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </td>
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
