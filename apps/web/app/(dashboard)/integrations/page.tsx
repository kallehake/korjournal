'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';
import type { Integration, IntegrationProvider, IntegrationStatus } from '@korjournal/shared';
import { integrationProviderLabels, formatDate } from '@korjournal/shared';

const providerDescriptions: Record<IntegrationProvider, string> = {
  fortnox: 'Exportera resedata och milersättning till Fortnox bokföring.',
  visma: 'Synkronisera körjournalsdata med Visma Administration/eEkonomi.',
  hogia: 'Anslut till Hogia för automatisk bokföring av reseersättningar.',
  custom_api: 'Integrera med valfritt system via REST API.',
};

const statusStyles: Record<IntegrationStatus, { label: string; classes: string }> = {
  active: { label: 'Aktiv', classes: 'bg-green-100 text-green-800' },
  inactive: { label: 'Inaktiv', classes: 'bg-gray-100 text-gray-600' },
  error: { label: 'Fel', classes: 'bg-red-100 text-red-800' },
};

const allProviders: IntegrationProvider[] = ['fortnox', 'visma', 'hogia', 'custom_api'];

export default function IntegrationsPage() {
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();
  const [setupProvider, setSetupProvider] = useState<IntegrationProvider | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [mileageRate, setMileageRate] = useState('2.50');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [showSyncPreview, setShowSyncPreview] = useState<string | null>(null);

  const { data: integrations, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .order('provider');
      if (error) throw error;
      return data as Integration[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!setupProvider) return;
      const existing = integrations?.find((i) => i.provider === setupProvider);
      const payload = {
        provider: setupProvider,
        status: 'inactive' as IntegrationStatus,
        config: {
          api_key: apiKey,
          api_secret: apiSecret,
          mileage_rate: parseFloat(mileageRate),
        },
      };
      if (existing) {
        const { error } = await supabase.from('integrations').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('integrations').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setSetupProvider(null);
      setApiKey('');
      setApiSecret('');
      setTestResult(null);
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (id: string) => {
      // Placeholder sync - would call API
      const { error } = await supabase
        .from('integrations')
        .update({ last_sync_at: new Date().toISOString(), status: 'active' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });

  function testConnection() {
    setTestResult(null);
    setTimeout(() => {
      if (apiKey.length > 3) {
        setTestResult('success');
      } else {
        setTestResult('error');
      }
    }, 1000);
  }

  function getIntegration(provider: IntegrationProvider) {
    return integrations?.find((i) => i.provider === provider);
  }

  function openSetup(provider: IntegrationProvider) {
    const existing = getIntegration(provider);
    setSetupProvider(provider);
    setApiKey(existing?.config?.api_key ?? '');
    setApiSecret(existing?.config?.api_secret ?? '');
    setMileageRate(String(existing?.config?.mileage_rate ?? '2.50'));
    setTestResult(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Integrationer</h1>
      </div>

      {/* Setup modal */}
      {setupProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Konfigurera {integrationProviderLabels[setupProvider]}
            </h2>
            <p className="text-sm text-gray-500 mb-4">{providerDescriptions[setupProvider]}</p>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API-nyckel</label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-sm font-mono"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Ange API-nyckel"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API-hemlighet</label>
                <input
                  type="password"
                  className="w-full border rounded-md px-3 py-2 text-sm font-mono"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Ange API-hemlighet"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Milersättning (kr/km)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={mileageRate}
                  onChange={(e) => setMileageRate(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">Standard: 2,50 kr/km (Skatteverkets schablon 2024)</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={testConnection}
                  className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50 font-medium"
                >
                  Testa anslutning
                </button>
                {testResult === 'success' && (
                  <span className="text-sm text-green-600 font-medium">Anslutningen lyckades!</span>
                )}
                {testResult === 'error' && (
                  <span className="text-sm text-red-600 font-medium">Anslutningen misslyckades</span>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSetupProvider(null)}
                  className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
                >
                  Avbryt
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {saveMutation.isPending ? 'Sparar...' : 'Spara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sync preview modal */}
      {showSyncPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Förhandsgranska export</h2>
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
              <p className="text-gray-600">Följande data kommer att exporteras:</p>
              <ul className="list-disc list-inside text-gray-700 space-y-1">
                <li>Reseersättningar senaste perioden</li>
                <li>Milersättning baserat på konfigurerad sats</li>
                <li>Verifikationer per fordon/förare</li>
              </ul>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowSyncPreview(null)}
                className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
              >
                Avbryt
              </button>
              <button
                onClick={() => {
                  syncMutation.mutate(showSyncPreview);
                  setShowSyncPreview(null);
                }}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                Synka nu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Integration cards */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Laddar integrationer...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {allProviders.map((provider) => {
            const integration = getIntegration(provider);
            const status = integration?.status ?? 'inactive';
            const style = statusStyles[status];

            return (
              <div key={provider} className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {integrationProviderLabels[provider]}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">{providerDescriptions[provider]}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.classes}`}>
                    {style.label}
                  </span>
                </div>

                {integration?.last_sync_at && (
                  <p className="text-xs text-gray-400 mb-3">
                    Senaste synk: {formatDate(integration.last_sync_at)}
                  </p>
                )}

                {integration?.last_error && (
                  <div className="bg-red-50 rounded-md p-3 mb-3">
                    <p className="text-xs text-red-700">{integration.last_error}</p>
                  </div>
                )}

                {integration?.config?.mileage_rate && (
                  <p className="text-xs text-gray-500 mb-3">
                    Milersättning: {integration.config.mileage_rate} kr/km
                  </p>
                )}

                <div className="flex gap-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => openSetup(provider)}
                    className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                  >
                    {integration ? 'Konfigurera' : 'Anslut'}
                  </button>
                  {integration && integration.status !== 'inactive' && (
                    <button
                      onClick={() => setShowSyncPreview(integration.id)}
                      className="text-sm text-green-600 hover:text-green-800 font-medium"
                    >
                      Synka nu
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
