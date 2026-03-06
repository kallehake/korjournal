import React, { useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Switch,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/stores/authStore';
import { formatDate } from '@korjournal/shared';

export default function ChecklistScreen() {
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [responses, setResponses] = useState<Record<string, boolean>>({});

  const { data: templates } = useQuery({
    queryKey: ['checklist_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: recentResponses, isLoading } = useQuery({
    queryKey: ['checklist_responses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_responses')
        .select(`*, vehicle:vehicles!vehicle_id(registration_number), template:checklist_templates!template_id(name)`)
        .eq('driver_id', profile!.id)
        .order('completed_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const { data } = await supabase.from('vehicles').select('id, registration_number')
        .eq('is_active', true);
      return data ?? [];
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const items = selectedTemplate.items as Array<{ label: string; required: boolean }>;
      const allPassed = items.every((_, i) => responses[i.toString()]);

      const { error } = await supabase.from('checklist_responses').insert({
        template_id: selectedTemplate.id,
        vehicle_id: selectedVehicleId,
        driver_id: profile!.id,
        organization_id: profile!.organization_id,
        responses: Object.fromEntries(
          Object.entries(responses).map(([k, v]) => [k, { checked: v }])
        ),
        all_passed: allPassed,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist_responses'] });
      setSelectedTemplate(null);
      setResponses({});
      Alert.alert('Klart', 'Fordonskontroll sparad');
    },
  });

  if (selectedTemplate) {
    const items = selectedTemplate.items as Array<{ label: string; required: boolean }>;
    return (
      <ScrollView style={styles.formContainer}>
        <Text style={styles.formTitle}>{selectedTemplate.name}</Text>

        <Text style={styles.label}>Fordon</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {vehicles?.map((v) => (
            <TouchableOpacity key={v.id}
              style={[styles.chip, selectedVehicleId === v.id && styles.chipActive]}
              onPress={() => setSelectedVehicleId(v.id)}>
              <Text style={[styles.chipText, selectedVehicleId === v.id && { color: '#2563eb' }]}>
                {v.registration_number}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {items.map((item, i) => (
          <View key={i} style={styles.checkItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.checkLabel}>{item.label}</Text>
              {item.required && <Text style={styles.requiredTag}>Obligatorisk</Text>}
            </View>
            <Switch
              value={responses[i.toString()] ?? false}
              onValueChange={(v) => setResponses({ ...responses, [i.toString()]: v })}
              trackColor={{ true: '#16a34a' }}
            />
          </View>
        ))}

        <View style={styles.formActions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelectedTemplate(null)}>
            <Text style={styles.cancelBtnText}>Avbryt</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn}
            onPress={() => submitMutation.mutate()}
            disabled={!selectedVehicleId || submitMutation.isPending}>
            <Text style={styles.saveBtnText}>
              {submitMutation.isPending ? 'Sparar...' : 'Skicka in'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Fordonskontroll</Text>
      </View>

      {/* Templates */}
      {templates && templates.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Starta kontroll</Text>
          {templates.map((t) => (
            <TouchableOpacity key={t.id} style={styles.templateCard}
              onPress={() => { setSelectedTemplate(t); setResponses({}); }}>
              <Text style={styles.templateName}>{t.name}</Text>
              <Text style={styles.templateInfo}>{(t.items as any[]).length} kontrollpunkter</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Recent responses */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Senaste kontroller</Text>
        {isLoading ? <ActivityIndicator /> : (
          <FlatList
            data={recentResponses}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={[styles.responseCard, !item.all_passed && styles.responseCardFail]}>
                <View style={styles.responseHeader}>
                  <Text style={styles.responseName}>{(item.template as any)?.name}</Text>
                  <Text style={[styles.statusBadge, item.all_passed ? styles.statusPass : styles.statusFail]}>
                    {item.all_passed ? 'Godkänd' : 'Ej godkänd'}
                  </Text>
                </View>
                <Text style={styles.responseInfo}>
                  {(item.vehicle as any)?.registration_number} | {formatDate(item.completed_at)}
                </Text>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>Inga kontroller utförda</Text>}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  title: { fontSize: 20, fontWeight: '700' },
  section: { padding: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#888', marginBottom: 8, textTransform: 'uppercase' },
  templateCard: {
    backgroundColor: '#eff6ff', borderRadius: 12, padding: 16, marginBottom: 8,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  templateName: { fontSize: 16, fontWeight: '700', color: '#1e40af' },
  templateInfo: { fontSize: 13, color: '#3b82f6', marginTop: 4 },
  responseCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
  responseCardFail: { borderColor: '#fecaca' },
  responseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  responseName: { fontSize: 15, fontWeight: '600' },
  statusBadge: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPass: { backgroundColor: '#f0fdf4', color: '#16a34a' },
  statusFail: { backgroundColor: '#fef2f2', color: '#dc2626' },
  responseInfo: { fontSize: 12, color: '#888', marginTop: 4 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 20 },
  formContainer: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 60 },
  formTitle: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', marginRight: 8 },
  chipActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  chipText: { fontSize: 14, fontWeight: '700', color: '#333' },
  checkItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  checkLabel: { fontSize: 15, color: '#333' },
  requiredTag: { fontSize: 11, color: '#dc2626', marginTop: 2 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 24, marginBottom: 40 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: '#666', fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#2563eb', alignItems: 'center' },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
