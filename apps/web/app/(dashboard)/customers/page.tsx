'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';
import type { Customer } from '@korjournal/shared';

interface Project {
  id: string;
  customer_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export default function CustomersPage() {
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [showProjectForm, setShowProjectForm] = useState<string | null>(null); // customer_id
  const [editingProject, setEditingProject] = useState<Project | null>(null);

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

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('is_active', true)
        .order('name');
      return data ?? [];
    },
  });

  const saveCustomerMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const customer = {
        name: formData.get('name') as string,
        org_number: (formData.get('org_number') as string) || null,
        contact_person: (formData.get('contact_person') as string) || null,
        email: (formData.get('email') as string) || null,
        phone: (formData.get('phone') as string) || null,
        address: (formData.get('address') as string) || null,
        city: (formData.get('city') as string) || null,
        zip_code: (formData.get('zip_code') as string) || null,
      };
      if (editingCustomer) {
        const { error } = await supabase.from('customers').update(customer).eq('id', editingCustomer.id);
        if (error) throw error;
      } else {
        const { data: profile } = await supabase.from('profiles').select('organization_id').single();
        const { error } = await supabase.from('customers').insert({ ...customer, organization_id: profile!.organization_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setShowCustomerForm(false);
      setEditingCustomer(null);
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });

  const saveProjectMutation = useMutation({
    mutationFn: async ({ formData, customerId }: { formData: FormData; customerId: string }) => {
      const project = {
        name: formData.get('name') as string,
        description: (formData.get('description') as string) || null,
      };
      if (editingProject) {
        const { error } = await supabase.from('projects').update(project).eq('id', editingProject.id);
        if (error) throw error;
      } else {
        const { data: profile } = await supabase.from('profiles').select('organization_id').single();
        const { error } = await supabase.from('projects').insert({
          ...project,
          customer_id: customerId,
          organization_id: profile!.organization_id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowProjectForm(null);
      setEditingProject(null);
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('projects').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const projectsForCustomer = (customerId: string) =>
    (projects ?? []).filter((p: Project) => p.customer_id === customerId);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Kunder & Projekt</h1>
        <button
          onClick={() => { setEditingCustomer(null); setShowCustomerForm(true); }}
          className="btn-primary"
        >
          Lägg till kund
        </button>
      </div>

      {/* Customer form modal */}
      {showCustomerForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">{editingCustomer ? 'Redigera kund' : 'Ny kund'}</h2>
            <form onSubmit={(e) => { e.preventDefault(); saveCustomerMutation.mutate(new FormData(e.currentTarget)); }}>
              <div className="space-y-3">
                <div>
                  <label className="label">Namn *</label>
                  <input name="name" required defaultValue={editingCustomer?.name ?? ''} className="input" />
                </div>
                <div>
                  <label className="label">Organisationsnummer</label>
                  <input name="org_number" defaultValue={editingCustomer?.org_number ?? ''} className="input" placeholder="556xxx-xxxx" />
                </div>
                <div>
                  <label className="label">Kontaktperson</label>
                  <input name="contact_person" defaultValue={editingCustomer?.contact_person ?? ''} className="input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">E-post</label>
                    <input name="email" type="email" defaultValue={editingCustomer?.email ?? ''} className="input" />
                  </div>
                  <div>
                    <label className="label">Telefon</label>
                    <input name="phone" defaultValue={editingCustomer?.phone ?? ''} className="input" />
                  </div>
                </div>
                <div>
                  <label className="label">Adress</label>
                  <input name="address" defaultValue={editingCustomer?.address ?? ''} className="input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Postnummer</label>
                    <input name="zip_code" defaultValue={editingCustomer?.zip_code ?? ''} className="input" />
                  </div>
                  <div>
                    <label className="label">Stad</label>
                    <input name="city" defaultValue={editingCustomer?.city ?? ''} className="input" />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => { setShowCustomerForm(false); setEditingCustomer(null); }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Avbryt</button>
                <button type="submit" disabled={saveCustomerMutation.isPending} className="btn-primary flex-1">
                  {saveCustomerMutation.isPending ? 'Sparar...' : 'Spara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project form modal */}
      {showProjectForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-4">{editingProject ? 'Redigera projekt' : 'Nytt projekt'}</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              saveProjectMutation.mutate({ formData: new FormData(e.currentTarget), customerId: showProjectForm });
            }}>
              <div className="space-y-3">
                <div>
                  <label className="label">Projektnamn *</label>
                  <input name="name" required defaultValue={editingProject?.name ?? ''} className="input" placeholder="T.ex. Webbprojekt 2026" />
                </div>
                <div>
                  <label className="label">Beskrivning</label>
                  <textarea name="description" defaultValue={editingProject?.description ?? ''} className="input resize-none" rows={2} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => { setShowProjectForm(null); setEditingProject(null); }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Avbryt</button>
                <button type="submit" disabled={saveProjectMutation.isPending} className="btn-primary flex-1">
                  {saveProjectMutation.isPending ? 'Sparar...' : 'Spara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Laddar kunder...</div>
      ) : customers?.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Inga kunder registrerade</div>
      ) : (
        <div className="space-y-3">
          {customers?.map((customer) => {
            const cProjects = projectsForCustomer(customer.id);
            const isExpanded = expandedCustomerId === customer.id;
            return (
              <div key={customer.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                {/* Customer row */}
                <div className="flex items-center px-4 py-3">
                  <button
                    onClick={() => setExpandedCustomerId(isExpanded ? null : customer.id)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <svg className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{customer.name}</p>
                      <p className="text-xs text-gray-400">
                        {[customer.city, customer.org_number].filter(Boolean).join(' · ')}
                        {cProjects.length > 0 && ` · ${cProjects.length} projekt`}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-3 ml-4">
                    <button
                      onClick={() => { setShowProjectForm(customer.id); setEditingProject(null); }}
                      className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1"
                    >
                      + Projekt
                    </button>
                    <button onClick={() => { setEditingCustomer(customer); setShowCustomerForm(true); }}
                      className="text-sm text-gray-500 hover:text-gray-700">Redigera</button>
                    <button onClick={() => { if (confirm('Ta bort kunden?')) deleteCustomerMutation.mutate(customer.id); }}
                      className="text-sm text-red-500 hover:text-red-700">Ta bort</button>
                  </div>
                </div>

                {/* Projects (expanded) */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                    {cProjects.length === 0 ? (
                      <p className="text-xs text-gray-400 py-1">Inga projekt — klicka "+ Projekt" för att lägga till.</p>
                    ) : (
                      <div className="space-y-2">
                        {cProjects.map((p) => (
                          <div key={p.id} className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-3 py-2">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{p.name}</p>
                              {p.description && <p className="text-xs text-gray-400">{p.description}</p>}
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => { setEditingProject(p); setShowProjectForm(customer.id); }}
                                className="text-xs text-gray-500 hover:text-gray-700">Redigera</button>
                              <button onClick={() => { if (confirm('Ta bort projektet?')) deleteProjectMutation.mutate(p.id); }}
                                className="text-xs text-red-500 hover:text-red-700">Ta bort</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
