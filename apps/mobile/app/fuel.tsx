import React, { useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput,
  Modal, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/stores/authStore';
import { formatDate } from '@korjournal/shared';

export default function FuelScreen() {
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const [vehicleId, setVehicleId] = useState('');
  const [liters, setLiters] = useState('');
  const [cost, setCost] = useState('');
  const [station, setStation] = useState('');
  const [odometer, setOdometer] = useState('');

  const { data: fuelLogs, isLoading } = useQuery({
    queryKey: ['fuel_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_logs')
        .select(`*, vehicle:vehicles!vehicle_id(registration_number)`)
        .order('recorded_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const { data } = await supabase.from('vehicles').select('id, registration_number')
        .eq('is_active', true).order('registration_number');
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('fuel_logs').insert({
        vehicle_id: vehicleId,
        organization_id: profile!.organization_id,
        recorded_by: profile!.id,
        log_type: 'refuel',
        liters: liters ? parseFloat(liters) : null,
        cost_sek: cost ? parseFloat(cost) : null,
        station_name: station || null,
        odometer_km: odometer ? parseInt(odometer, 10) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel_logs'] });
      setShowForm(false);
      setLiters(''); setCost(''); setStation(''); setOdometer('');
    },
  });

  // Stats
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthLogs = fuelLogs?.filter((l) => l.recorded_at.startsWith(thisMonth)) ?? [];
  const totalCost = monthLogs.reduce((s, l) => s + (l.cost_sek ?? 0), 0);
  const totalLiters = monthLogs.reduce((s, l) => s + (l.liters ?? 0), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Bränsle</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
          <Text style={styles.addBtnText}>+ Tanka</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalCost.toFixed(0)} kr</Text>
          <Text style={styles.statLabel}>Kostnad denna månad</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalLiters.toFixed(1)} L</Text>
          <Text style={styles.statLabel}>Liter denna månad</Text>
        </View>
      </View>

      {isLoading ? <ActivityIndicator style={{ marginTop: 40 }} /> : (
        <FlatList
          data={fuelLogs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardVehicle}>{(item.vehicle as any)?.registration_number}</Text>
                <Text style={styles.cardDate}>{formatDate(item.recorded_at)}</Text>
              </View>
              <View style={styles.cardStats}>
                {item.liters && <Text style={styles.cardStat}>{item.liters} L</Text>}
                {item.cost_sek && <Text style={styles.cardStat}>{item.cost_sek} kr</Text>}
                {item.station_name && <Text style={styles.cardStation}>{item.station_name}</Text>}
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Inga tankningar registrerade</Text>}
        />
      )}

      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.formContainer}>
          <Text style={styles.formTitle}>Ny tankning</Text>

          <Text style={styles.label}>Fordon *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {vehicles?.map((v) => (
              <TouchableOpacity key={v.id}
                style={[styles.vehicleChip, vehicleId === v.id && styles.vehicleChipActive]}
                onPress={() => setVehicleId(v.id)}>
                <Text style={[styles.vehicleChipText, vehicleId === v.id && { color: '#2563eb' }]}>
                  {v.registration_number}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.label}>Liter</Text>
          <TextInput style={styles.input} value={liters} onChangeText={setLiters}
            keyboardType="decimal-pad" placeholder="T.ex. 45.5" />

          <Text style={styles.label}>Kostnad (kr)</Text>
          <TextInput style={styles.input} value={cost} onChangeText={setCost}
            keyboardType="decimal-pad" placeholder="T.ex. 850" />

          <Text style={styles.label}>Bensinstation</Text>
          <TextInput style={styles.input} value={station} onChangeText={setStation}
            placeholder="T.ex. Circle K Solna" />

          <Text style={styles.label}>Mätarställning (km)</Text>
          <TextInput style={styles.input} value={odometer} onChangeText={setOdometer}
            keyboardType="numeric" placeholder="Aktuell mätarställning" />

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)}>
              <Text style={styles.cancelBtnText}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={() => saveMutation.mutate()}
              disabled={!vehicleId || saveMutation.isPending}>
              <Text style={styles.saveBtnText}>
                {saveMutation.isPending ? 'Sparar...' : 'Spara'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  title: { fontSize: 20, fontWeight: '700' },
  addBtn: { backgroundColor: '#16a34a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10, padding: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#eee' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#111' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 4 },
  list: { padding: 12, paddingTop: 0 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  cardVehicle: { fontSize: 15, fontWeight: '700' },
  cardDate: { fontSize: 13, color: '#888' },
  cardStats: { flexDirection: 'row', gap: 12 },
  cardStat: { fontSize: 14, color: '#333', fontWeight: '600' },
  cardStation: { fontSize: 13, color: '#888' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40 },
  formContainer: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 60 },
  formTitle: { fontSize: 22, fontWeight: '700', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  vehicleChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', marginRight: 8 },
  vehicleChipActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  vehicleChipText: { fontSize: 14, fontWeight: '700', color: '#333' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: '#666', fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#16a34a', alignItems: 'center' },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
