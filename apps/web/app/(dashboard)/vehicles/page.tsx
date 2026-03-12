'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '../../../lib/supabase/client';
import type { Vehicle, FuelType } from '@korjournal/shared';

const fuelTypeLabels: Record<FuelType, string> = {
  petrol: 'Bensin',
  diesel: 'Diesel',
  electric: 'El',
  hybrid: 'Hybrid',
  plugin_hybrid: 'Laddhybrid',
  other: 'Övrigt',
};

export default function VehiclesPage() {
  const supabase = createBrowserClient();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function loadVehicles() {
    const { data } = await supabase
      .from('vehicles')
      .select('*')
      .eq('is_active', true)
      .order('registration_number');
    setVehicles(data ?? []);
    setLoading(false);
  }

  useEffect(() => { loadVehicles(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);

    const vehicle = {
      registration_number: fd.get('registration_number') as string,
      make: (fd.get('make') as string) || null,
      model: (fd.get('model') as string) || null,
      year: fd.get('year') ? Number(fd.get('year')) : null,
      fuel_type: fd.get('fuel_type') as FuelType,
      is_company_car: fd.get('is_company_car') === 'true',
    };

    if (editingVehicle) {
      const { error } = await supabase.from('vehicles').update(vehicle).eq('id', editingVehicle.id);
      if (error) { setError(error.message); setSaving(false); return; }
    } else {
      const { data: profile } = await supabase.from('profiles').select('organization_id').single();
      if (!profile) { setError('Profil saknas — gå till Inställningar och slutför inställningar först.'); setSaving(false); return; }
      const { error } = await supabase.from('vehicles').insert({ ...vehicle, organization_id: profile.organization_id });
      if (error) { setError(error.message); setSaving(false); return; }
    }

    setSaving(false);
    setShowForm(false);
    setEditingVehicle(null);
    loadVehicles();
  }

  async function handleDelete(id: string) {
    if (!confirm('Ta bort detta fordon?')) return;
    await supabase.from('vehicles').update({ is_active: false }).eq('id', id);
    loadVehicles();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Fordon</h1>
        <button
          onClick={() => { setEditingVehicle(null); setShowForm(true); setError(''); }}
          className="btn-primary"
        >
          Lägg till fordon
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {editingVehicle ? 'Redigera fordon' : 'Nytt fordon'}
            </h2>
            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="label">Registreringsnummer *</label>
                <input name="registration_number" required defaultValue={editingVehicle?.registration_number ?? ''}
                  className="input" placeholder="ABC123" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Märke</label>
                  <input name="make" defaultValue={editingVehicle?.make ?? ''} className="input" placeholder="BYD" />
                </div>
                <div>
                  <label className="label">Modell</label>
                  <input name="model" defaultValue={editingVehicle?.model ?? ''} className="input" placeholder="Seal" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Årsmodell</label>
                  <input name="year" type="number" defaultValue={editingVehicle?.year ?? ''} className="input" placeholder="2024" />
                </div>
                <div>
                  <label className="label">Bränsle</label>
                  <select name="fuel_type" defaultValue={editingVehicle?.fuel_type ?? 'electric'} className="input">
                    {Object.entries(fuelTypeLabels).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input name="is_company_car" type="checkbox" value="true"
                    defaultChecked={editingVehicle?.is_company_car ?? true} className="rounded" />
                  Tjänstebil
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowForm(false); setEditingVehicle(null); }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
                  Avbryt
                </button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Sparar...' : 'Spara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-400">Laddar fordon...</div>
      ) : vehicles.length === 0 ? (
        <div className="py-12 text-center text-gray-400">Inga fordon registrerade</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((vehicle) => (
            <div key={vehicle.id} className="card">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{vehicle.registration_number}</h3>
                  <p className="text-sm text-gray-500">
                    {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ')}
                  </p>
                </div>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {vehicle.fuel_type ? fuelTypeLabels[vehicle.fuel_type] : '–'}
                </span>
              </div>
              {vehicle.current_odometer != null && (
                <p className="mb-3 text-sm text-gray-600">
                  Mätarställning: <span className="font-medium">{vehicle.current_odometer.toLocaleString('sv-SE')} km</span>
                </p>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setEditingVehicle(vehicle); setShowForm(true); setError(''); }}
                  className="text-sm text-primary-600 hover:underline">
                  Redigera
                </button>
                <button onClick={() => handleDelete(vehicle.id)}
                  className="text-sm text-red-600 hover:underline">
                  Ta bort
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
