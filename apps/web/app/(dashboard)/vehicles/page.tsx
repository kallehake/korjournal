'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../../lib/supabase/client';
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
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('is_active', true)
        .order('registration_number');
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const vehicle = {
        registration_number: formData.get('registration_number') as string,
        make: formData.get('make') as string || null,
        model: formData.get('model') as string || null,
        year: formData.get('year') ? Number(formData.get('year')) : null,
        fuel_type: formData.get('fuel_type') as FuelType,
        current_odometer: formData.get('current_odometer') ? Number(formData.get('current_odometer')) : null,
        is_company_car: formData.get('is_company_car') === 'true',
      };

      if (editingVehicle) {
        const { error } = await supabase.from('vehicles').update(vehicle).eq('id', editingVehicle.id);
        if (error) throw error;
      } else {
        const { data: profile } = await supabase.from('profiles').select('organization_id').single();
        const { error } = await supabase.from('vehicles').insert({
          ...vehicle,
          organization_id: profile!.organization_id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setShowForm(false);
      setEditingVehicle(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vehicles').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Fordon</h1>
        <button
          onClick={() => { setEditingVehicle(null); setShowForm(true); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          Lägg till fordon
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">
              {editingVehicle ? 'Redigera fordon' : 'Nytt fordon'}
            </h2>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(new FormData(e.currentTarget)); }}>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Registreringsnummer *</label>
                  <input name="registration_number" required defaultValue={editingVehicle?.registration_number ?? ''}
                    className="w-full border rounded-md px-3 py-2 text-sm" placeholder="ABC123" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Märke</label>
                    <input name="make" defaultValue={editingVehicle?.make ?? ''}
                      className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Volvo" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Modell</label>
                    <input name="model" defaultValue={editingVehicle?.model ?? ''}
                      className="w-full border rounded-md px-3 py-2 text-sm" placeholder="XC60" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Årsmodell</label>
                    <input name="year" type="number" defaultValue={editingVehicle?.year ?? ''}
                      className="w-full border rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bränsle</label>
                    <select name="fuel_type" defaultValue={editingVehicle?.fuel_type ?? 'petrol'}
                      className="w-full border rounded-md px-3 py-2 text-sm">
                      {Object.entries(fuelTypeLabels).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mätarställning (km)</label>
                  <input name="current_odometer" type="number" defaultValue={editingVehicle?.current_odometer ?? ''}
                    className="w-full border rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm">
                    <input name="is_company_car" type="checkbox" value="true"
                      defaultChecked={editingVehicle?.is_company_car ?? true} className="rounded" />
                    Tjänstebil
                  </label>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => { setShowForm(false); setEditingVehicle(null); }}
                  className="flex-1 px-4 py-2 border rounded-md text-sm hover:bg-gray-50">
                  Avbryt
                </button>
                <button type="submit" disabled={saveMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
                  {saveMutation.isPending ? 'Sparar...' : 'Spara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vehicle list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Laddar fordon...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles?.map((vehicle) => (
            <div key={vehicle.id} className="bg-white rounded-lg shadow-sm border p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{vehicle.registration_number}</h3>
                  <p className="text-sm text-gray-500">
                    {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ')}
                  </p>
                </div>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                  {fuelTypeLabels[vehicle.fuel_type]}
                </span>
              </div>
              {vehicle.current_odometer && (
                <p className="text-sm text-gray-600 mb-3">
                  Mätarställning: {vehicle.current_odometer.toLocaleString()} km
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditingVehicle(vehicle); setShowForm(true); }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Redigera
                </button>
                <button
                  onClick={() => {
                    if (confirm('Ta bort detta fordon?')) deleteMutation.mutate(vehicle.id);
                  }}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Ta bort
                </button>
              </div>
            </div>
          ))}
          {vehicles?.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-400">
              Inga fordon registrerade
            </div>
          )}
        </div>
      )}
    </div>
  );
}
