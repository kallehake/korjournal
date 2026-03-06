'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';
import type { Customer } from '@korjournal/shared';

export default function CustomersPage() {
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const customer = {
        name: formData.get('name') as string,
        org_number: formData.get('org_number') as string || null,
        contact_person: formData.get('contact_person') as string || null,
        email: formData.get('email') as string || null,
        phone: formData.get('phone') as string || null,
        address: formData.get('address') as string || null,
        city: formData.get('city') as string || null,
        zip_code: formData.get('zip_code') as string || null,
      };

      if (editingCustomer) {
        const { error } = await supabase.from('customers').update(customer).eq('id', editingCustomer.id);
        if (error) throw error;
      } else {
        const { data: profile } = await supabase.from('profiles').select('organization_id').single();
        const { error } = await supabase.from('customers').insert({
          ...customer,
          organization_id: profile!.organization_id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setShowForm(false);
      setEditingCustomer(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Kunder</h1>
        <button
          onClick={() => { setEditingCustomer(null); setShowForm(true); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          Lägg till kund
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">
              {editingCustomer ? 'Redigera kund' : 'Ny kund'}
            </h2>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(new FormData(e.currentTarget)); }}>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Namn *</label>
                  <input name="name" required defaultValue={editingCustomer?.name ?? ''}
                    className="w-full border rounded-md px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Organisationsnummer</label>
                  <input name="org_number" defaultValue={editingCustomer?.org_number ?? ''}
                    className="w-full border rounded-md px-3 py-2 text-sm" placeholder="556xxx-xxxx" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kontaktperson</label>
                  <input name="contact_person" defaultValue={editingCustomer?.contact_person ?? ''}
                    className="w-full border rounded-md px-3 py-2 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">E-post</label>
                    <input name="email" type="email" defaultValue={editingCustomer?.email ?? ''}
                      className="w-full border rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                    <input name="phone" defaultValue={editingCustomer?.phone ?? ''}
                      className="w-full border rounded-md px-3 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adress</label>
                  <input name="address" defaultValue={editingCustomer?.address ?? ''}
                    className="w-full border rounded-md px-3 py-2 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Postnummer</label>
                    <input name="zip_code" defaultValue={editingCustomer?.zip_code ?? ''}
                      className="w-full border rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stad</label>
                    <input name="city" defaultValue={editingCustomer?.city ?? ''}
                      className="w-full border rounded-md px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => { setShowForm(false); setEditingCustomer(null); }}
                  className="flex-1 px-4 py-2 border rounded-md text-sm hover:bg-gray-50">Avbryt</button>
                <button type="submit" disabled={saveMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
                  {saveMutation.isPending ? 'Sparar...' : 'Spara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Laddar kunder...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Namn</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Org.nr</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Kontakt</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">E-post</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Stad</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers?.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{customer.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{customer.org_number ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{customer.contact_person ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{customer.email ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{customer.city ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <button
                      onClick={() => { setEditingCustomer(customer); setShowForm(true); }}
                      className="text-blue-600 hover:text-blue-800 mr-3"
                    >Redigera</button>
                    <button
                      onClick={() => { if (confirm('Ta bort denna kund?')) deleteMutation.mutate(customer.id); }}
                      className="text-red-600 hover:text-red-800"
                    >Ta bort</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {customers?.length === 0 && (
            <div className="text-center py-12 text-gray-400">Inga kunder registrerade</div>
          )}
        </div>
      )}
    </div>
  );
}
