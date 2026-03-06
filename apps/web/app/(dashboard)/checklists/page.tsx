'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';
import type { ChecklistTemplate, ChecklistResponse } from '@korjournal/shared';
import { formatDate, formatTime } from '@korjournal/shared';

export default function ChecklistsPage() {
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'templates' | 'responses'>('templates');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formItems, setFormItems] = useState<Array<{ label: string; required: boolean }>>([{ label: '', required: false }]);

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['checklist_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ChecklistTemplate[];
    },
  });

  const { data: responses, isLoading: responsesLoading } = useQuery({
    queryKey: ['checklist_responses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_responses')
        .select(`
          *,
          template:checklist_templates!template_id(id, name),
          driver:profiles!driver_id(id, full_name),
          vehicle:vehicles!vehicle_id(id, registration_number)
        `)
        .order('completed_at', { ascending: false });
      if (error) throw error;
      return data as (ChecklistResponse & {
        template: { id: string; name: string };
        driver: { id: string; full_name: string };
        vehicle: { id: string; registration_number: string };
      })[];
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const validItems = formItems.filter((i) => i.label.trim() !== '');
      const payload = {
        name: formName,
        items: validItems,
        is_active: true,
      };
      if (editingId) {
        const { error } = await supabase.from('checklist_templates').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('checklist_templates').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist_templates'] });
      resetForm();
    },
  });

  const toggleTemplateMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('checklist_templates').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklist_templates'] }),
  });

  function resetForm() {
    setFormName('');
    setFormItems([{ label: '', required: false }]);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(t: ChecklistTemplate) {
    setFormName(t.name);
    setFormItems(t.items.length > 0 ? [...t.items] : [{ label: '', required: false }]);
    setEditingId(t.id);
    setShowForm(true);
  }

  function addItem() {
    setFormItems([...formItems, { label: '', required: false }]);
  }

  function removeItem(index: number) {
    setFormItems(formItems.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: 'label' | 'required', value: string | boolean) {
    const updated = [...formItems];
    updated[index] = { ...updated[index], [field]: value };
    setFormItems(updated);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Checklistor</h1>
        {tab === 'templates' && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Ny mall
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('templates')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'templates' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Mallar
        </button>
        <button
          onClick={() => setTab('responses')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'responses' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Svar
        </button>
      </div>

      {/* Template form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editingId ? 'Redigera mall' : 'Ny checklista-mall'}
            </h2>
            <form
              onSubmit={(e) => { e.preventDefault(); saveTemplateMutation.mutate(); }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Namn</label>
                <input
                  type="text"
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="T.ex. Daglig fordonskontroll"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Kontrollpunkter</label>
                <div className="space-y-2">
                  {formItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        className="flex-1 border rounded-md px-3 py-2 text-sm"
                        value={item.label}
                        placeholder={`Punkt ${i + 1}`}
                        onChange={(e) => updateItem(i, 'label', e.target.value)}
                      />
                      <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={item.required}
                          onChange={(e) => updateItem(i, 'required', e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        Obligatorisk
                      </label>
                      {formItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          className="text-red-400 hover:text-red-600 p-1"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  className="mt-2 text-sm text-primary-600 hover:text-primary-800 font-medium"
                >
                  + Lägg till punkt
                </button>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={resetForm} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">
                  Avbryt
                </button>
                <button
                  type="submit"
                  disabled={saveTemplateMutation.isPending}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {saveTemplateMutation.isPending ? 'Sparar...' : 'Spara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Templates tab */}
      {tab === 'templates' && (
        <>
          {templatesLoading ? (
            <div className="text-center py-12 text-gray-500">Laddar mallar...</div>
          ) : (
            <div className="space-y-4">
              {templates?.map((t) => (
                <div key={t.id} className={`bg-white rounded-lg shadow-sm border p-5 ${!t.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{t.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{t.items.length} kontrollpunkter</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleTemplateMutation.mutate({ id: t.id, is_active: !t.is_active })}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${t.is_active ? 'bg-primary-600' : 'bg-gray-200'}`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${t.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                      <button
                        onClick={() => startEdit(t)}
                        className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                      >
                        Redigera
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {t.items.map((item, i) => (
                      <span
                        key={i}
                        className={`text-xs px-2 py-1 rounded-full ${item.required ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {item.label} {item.required && '*'}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {templates?.length === 0 && (
                <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
                  Inga mallar skapade. Klicka &quot;Ny mall&quot; för att börja.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Responses tab */}
      {tab === 'responses' && (
        <>
          {responsesLoading ? (
            <div className="text-center py-12 text-gray-500">Laddar svar...</div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mall</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Förare</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fordon</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {responses?.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.template?.name ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{r.driver?.full_name ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{r.vehicle?.registration_number ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(r.completed_at)} {formatTime(r.completed_at)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.all_passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {r.all_passed ? 'Godkänd' : 'Underkänd'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {responses?.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        Inga svar registrerade.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
