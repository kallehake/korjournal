'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';
import type { Alert, AlertRule, AlertType } from '@korjournal/shared';
import { alertTypeLabels, formatDate, formatTime } from '@korjournal/shared';

const alertIcons: Record<AlertType, string> = {
  odometer_deviation: '⚠',
  driverless_trip: '👤',
  no_trips_7d: '📅',
  no_trips_14d: '📅',
  gps_lost: '📡',
  speed_violation: '🚨',
  missing_purpose: '📝',
  private_limit_exceeded: '🔒',
  checklist_failed: '✗',
};

export default function AlertsPage() {
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'alerts' | 'rules'>('alerts');

  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Alert[];
    },
  });

  const { data: rules, isLoading: rulesLoading } = useQuery({
    queryKey: ['alert_rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alert_rules')
        .select('*')
        .order('alert_type');
      if (error) throw error;
      return data as AlertRule[];
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('alerts').update({ is_read: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('alerts')
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await supabase.from('alert_rules').update({ is_enabled }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert_rules'] }),
  });

  const updateThresholdMutation = useMutation({
    mutationFn: async ({ id, threshold_value }: { id: string; threshold_value: number | null }) => {
      const { error } = await supabase.from('alert_rules').update({ threshold_value }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert_rules'] }),
  });

  const unreadAlerts = alerts?.filter((a) => !a.is_read && !a.is_resolved) ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Varningar</h1>
        {unreadAlerts.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
            {unreadAlerts.length} olästa
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('alerts')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'alerts' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Aktiva varningar
        </button>
        <button
          onClick={() => setTab('rules')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'rules' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Varningsregler
        </button>
      </div>

      {tab === 'alerts' && (
        <div>
          {alertsLoading ? (
            <div className="text-center py-12 text-gray-500">Laddar varningar...</div>
          ) : unreadAlerts.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
              Inga aktiva varningar just nu.
            </div>
          ) : (
            <div className="space-y-3">
              {unreadAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`bg-white rounded-lg shadow-sm border p-4 flex items-start gap-4 ${!alert.is_read ? 'border-l-4 border-l-red-500' : ''}`}
                >
                  <div className="text-2xl flex-shrink-0 mt-0.5">
                    {alertIcons[alert.alert_type] ?? '⚠'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">{alert.title}</h3>
                        <span className="text-xs text-gray-400">
                          {alertTypeLabels[alert.alert_type]}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {formatDate(alert.created_at)} {formatTime(alert.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                    <div className="flex gap-3 mt-3">
                      {!alert.is_read && (
                        <button
                          onClick={() => markReadMutation.mutate(alert.id)}
                          className="text-xs font-medium text-primary-600 hover:text-primary-800"
                        >
                          Markera som läst
                        </button>
                      )}
                      {!alert.is_resolved && (
                        <button
                          onClick={() => resolveMutation.mutate(alert.id)}
                          className="text-xs font-medium text-green-600 hover:text-green-800"
                        >
                          Markera som löst
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Resolved alerts */}
          {(alerts?.filter((a) => a.is_resolved).length ?? 0) > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">Lösta varningar</h2>
              <div className="space-y-2">
                {alerts?.filter((a) => a.is_resolved).slice(0, 10).map((alert) => (
                  <div key={alert.id} className="bg-gray-50 rounded-lg border p-3 flex items-center gap-3 opacity-70">
                    <span className="text-lg">{alertIcons[alert.alert_type] ?? '⚠'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700">{alert.title}</p>
                      <p className="text-xs text-gray-400">{formatDate(alert.created_at)}</p>
                    </div>
                    <span className="text-xs text-green-600 font-medium">Löst</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'rules' && (
        <div>
          {rulesLoading ? (
            <div className="text-center py-12 text-gray-500">Laddar varningsregler...</div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border divide-y">
              {rules?.map((rule) => (
                <div key={rule.id} className="p-4 flex items-center gap-4">
                  <button
                    onClick={() => toggleRuleMutation.mutate({ id: rule.id, is_enabled: !rule.is_enabled })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${rule.is_enabled ? 'bg-primary-600' : 'bg-gray-200'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${rule.is_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {alertTypeLabels[rule.alert_type]}
                    </p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      {rule.notify_admin && <span>Admin</span>}
                      {rule.notify_driver && <span>Förare</span>}
                      {rule.notify_email.length > 0 && (
                        <span>{rule.notify_email.length} e-postmottagare</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Tröskelvärde:</label>
                    <input
                      type="number"
                      className="w-20 border rounded px-2 py-1 text-sm"
                      value={rule.threshold_value ?? ''}
                      placeholder="-"
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : null;
                        updateThresholdMutation.mutate({ id: rule.id, threshold_value: val });
                      }}
                    />
                  </div>
                </div>
              ))}
              {rules?.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  Inga varningsregler konfigurerade.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
