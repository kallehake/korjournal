'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';
import { scoreLabel, scoreColor, formatDistance } from '@korjournal/shared';

interface DriverWithStats {
  id: string;
  full_name: string;
  email: string;
  avg_score: number;
  total_trips: number;
  total_km: number;
  acceleration_avg: number | null;
  braking_avg: number | null;
  speeding_avg: number | null;
  idle_avg: number | null;
}

export default function DriversPage() {
  const supabase = createBrowserClient();
  const [selectedDriver, setSelectedDriver] = useState<DriverWithStats | null>(null);

  const { data: drivers, isLoading } = useQuery({
    queryKey: ['drivers-with-scores'],
    queryFn: async () => {
      // Get all drivers
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email');
      if (profilesError) throw profilesError;

      // Get scores
      const { data: scores, error: scoresError } = await supabase
        .from('driver_scores')
        .select('driver_id, overall_score, acceleration_score, braking_score, speeding_score, idle_score');
      if (scoresError) throw scoresError;

      // Get trip stats
      const { data: trips, error: tripsError } = await supabase
        .from('trips')
        .select('driver_id, distance_km')
        .eq('status', 'completed');
      if (tripsError) throw tripsError;

      return (profiles ?? []).map((p) => {
        const driverScores = (scores ?? []).filter((s) => s.driver_id === p.id);
        const driverTrips = (trips ?? []).filter((t) => t.driver_id === p.id);
        const avgScore = driverScores.length > 0
          ? Math.round(driverScores.reduce((sum, s) => sum + s.overall_score, 0) / driverScores.length)
          : 0;
        const accelAvg = driverScores.length > 0
          ? Math.round(driverScores.reduce((sum, s) => sum + (s.acceleration_score ?? 0), 0) / driverScores.length)
          : null;
        const brakeAvg = driverScores.length > 0
          ? Math.round(driverScores.reduce((sum, s) => sum + (s.braking_score ?? 0), 0) / driverScores.length)
          : null;
        const speedAvg = driverScores.length > 0
          ? Math.round(driverScores.reduce((sum, s) => sum + (s.speeding_score ?? 0), 0) / driverScores.length)
          : null;
        const idleAvg = driverScores.length > 0
          ? Math.round(driverScores.reduce((sum, s) => sum + (s.idle_score ?? 0), 0) / driverScores.length)
          : null;

        return {
          id: p.id,
          full_name: p.full_name ?? 'Okänd',
          email: p.email ?? '',
          avg_score: avgScore,
          total_trips: driverTrips.length,
          total_km: driverTrips.reduce((sum, t) => sum + (t.distance_km ?? 0), 0),
          acceleration_avg: accelAvg,
          braking_avg: brakeAvg,
          speeding_avg: speedAvg,
          idle_avg: idleAvg,
        } as DriverWithStats;
      });
    },
  });

  function ScoreBar({ label, score }: { label: string; score: number | null }) {
    if (score == null) return null;
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600 w-28">{label}</span>
        <div className="flex-1 bg-gray-200 rounded-full h-3">
          <div
            className="h-3 rounded-full transition-all"
            style={{ width: `${score}%`, backgroundColor: scoreColor(score) }}
          />
        </div>
        <span className="text-sm font-medium w-12 text-right" style={{ color: scoreColor(score) }}>
          {score}
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Förare</h1>
        <span className="text-sm text-gray-500">{drivers?.length ?? 0} förare</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Driver list */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">Laddar förare...</div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Förare</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Poäng</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Resor</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total km</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {drivers?.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedDriver(d)}
                      className={`cursor-pointer hover:bg-gray-50 ${selectedDriver?.id === d.id ? 'bg-primary-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{d.full_name}</p>
                        <p className="text-xs text-gray-400">{d.email}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {d.avg_score > 0 ? (
                          <span
                            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                            style={{ backgroundColor: scoreColor(d.avg_score) + '20', color: scoreColor(d.avg_score) }}
                          >
                            {d.avg_score} - {scoreLabel(d.avg_score)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Ingen data</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{d.total_trips}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatDistance(d.total_km)}</td>
                    </tr>
                  ))}
                  {drivers?.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">Inga förare hittades.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Score breakdown panel */}
        <div className="lg:col-span-1">
          {selectedDriver ? (
            <div className="bg-white rounded-lg shadow-sm border p-5 sticky top-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">{selectedDriver.full_name}</h2>
              <p className="text-sm text-gray-400 mb-4">{selectedDriver.email}</p>

              {selectedDriver.avg_score > 0 ? (
                <>
                  <div className="text-center mb-6">
                    <div
                      className="inline-flex items-center justify-center w-20 h-20 rounded-full text-2xl font-bold text-white"
                      style={{ backgroundColor: scoreColor(selectedDriver.avg_score) }}
                    >
                      {selectedDriver.avg_score}
                    </div>
                    <p className="mt-2 text-sm font-medium" style={{ color: scoreColor(selectedDriver.avg_score) }}>
                      {scoreLabel(selectedDriver.avg_score)}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <ScoreBar label="Acceleration" score={selectedDriver.acceleration_avg} />
                    <ScoreBar label="Inbromsning" score={selectedDriver.braking_avg} />
                    <ScoreBar label="Hastighet" score={selectedDriver.speeding_avg} />
                    <ScoreBar label="Tomgång" score={selectedDriver.idle_avg} />
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p className="text-xl font-bold text-gray-900">{selectedDriver.total_trips}</p>
                      <p className="text-xs text-gray-500">Resor</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-gray-900">{formatDistance(selectedDriver.total_km)}</p>
                      <p className="text-xs text-gray-500">Total sträcka</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">
                  Ingen poängdata tillgänglig för denna förare.
                </p>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-400">
              <p className="text-sm">Välj en förare för att se detaljerad poänguppdelning.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
