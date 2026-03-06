import React, { useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput,
  Modal, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/stores/authStore';
import { getCurrentPosition, reverseGeocode } from '../src/services/location';
import { geofenceTypeLabels, type GeofenceType } from '@korjournal/shared';

export default function GeofencesScreen() {
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState<GeofenceType>('office');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('200');
  const [autoType, setAutoType] = useState<string>('');

  const { data: geofences, isLoading } = useQuery({
    queryKey: ['geofences'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geofences')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('geofences').insert({
        organization_id: profile!.organization_id,
        name,
        type,
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        radius_meters: parseInt(radius, 10),
        auto_trip_type: autoType || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geofences'] });
      closeForm();
    },
  });

  const closeForm = () => {
    setShowForm(false);
    setName('');
    setLat('');
    setLng('');
    setRadius('200');
    setAutoType('');
  };

  const useCurrentLocation = async () => {
    try {
      const pos = await getCurrentPosition();
      setLat(pos.coords.latitude.toString());
      setLng(pos.coords.longitude.toString());
      if (!name) {
        const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setName(addr);
      }
    } catch {
      Alert.alert('Fel', 'Kunde inte hämta position');
    }
  };

  const typeColors: Record<GeofenceType, string> = {
    home: '#16a34a', office: '#2563eb', customer: '#9333ea', other: '#666',
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Geofences</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
          <Text style={styles.addBtnText}>+ Lägg till</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        Definiera zoner för automatisk klassificering av resor
      </Text>

      {isLoading ? <ActivityIndicator style={{ marginTop: 40 }} /> : (
        <FlatList
          data={geofences}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.typeDot, { backgroundColor: typeColors[item.type as GeofenceType] }]} />
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.typeBadge}>{geofenceTypeLabels[item.type as GeofenceType]}</Text>
              </View>
              <Text style={styles.cardInfo}>
                Radie: {item.radius_meters}m | {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
              </Text>
              {item.auto_trip_type && (
                <Text style={styles.autoLabel}>
                  Auto-klassificering: {item.auto_trip_type === 'business' ? 'Tjänst' : 'Privat'}
                </Text>
              )}
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Inga geofences. Lägg till hem och kontor för automatisk klassificering.</Text>
          }
        />
      )}

      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.formContainer}>
          <Text style={styles.formTitle}>Ny geofence</Text>

          <Text style={styles.label}>Namn *</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="T.ex. Kontoret" />

          <Text style={styles.label}>Typ</Text>
          <View style={styles.typeRow}>
            {(Object.entries(geofenceTypeLabels) as [GeofenceType, string][]).map(([key, label]) => (
              <TouchableOpacity key={key}
                style={[styles.typeChip, type === key && { borderColor: typeColors[key], backgroundColor: typeColors[key] + '15' }]}
                onPress={() => setType(key)}>
                <Text style={[styles.typeChipText, type === key && { color: typeColors[key] }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Position</Text>
          <TouchableOpacity style={styles.locationBtn} onPress={useCurrentLocation}>
            <Text style={styles.locationBtnText}>Använd nuvarande position</Text>
          </TouchableOpacity>
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1 }]} value={lat} onChangeText={setLat}
              placeholder="Latitud" keyboardType="decimal-pad" />
            <TextInput style={[styles.input, { flex: 1 }]} value={lng} onChangeText={setLng}
              placeholder="Longitud" keyboardType="decimal-pad" />
          </View>

          <Text style={styles.label}>Radie (meter)</Text>
          <TextInput style={styles.input} value={radius} onChangeText={setRadius}
            keyboardType="numeric" placeholder="200" />

          <Text style={styles.label}>Auto-klassificering</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity style={[styles.typeChip, autoType === '' && styles.typeChipActive]}
              onPress={() => setAutoType('')}>
              <Text style={styles.typeChipText}>Ingen</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.typeChip, autoType === 'business' && styles.typeChipActive]}
              onPress={() => setAutoType('business')}>
              <Text style={styles.typeChipText}>Tjänst</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.typeChip, autoType === 'private' && styles.typeChipActive]}
              onPress={() => setAutoType('private')}>
              <Text style={styles.typeChipText}>Privat</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={closeForm}>
              <Text style={styles.cancelBtnText}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={() => saveMutation.mutate()}
              disabled={!name || !lat || !lng || saveMutation.isPending}>
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
  subtitle: { fontSize: 13, color: '#888', padding: 16, paddingBottom: 0 },
  addBtn: { backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  list: { padding: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  typeDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  cardName: { fontSize: 16, fontWeight: '700', flex: 1 },
  typeBadge: { fontSize: 12, color: '#888' },
  cardInfo: { fontSize: 12, color: '#888' },
  autoLabel: { fontSize: 12, color: '#2563eb', marginTop: 4 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 14, paddingHorizontal: 20 },
  formContainer: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 60 },
  formTitle: { fontSize: 22, fontWeight: '700', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  typeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ddd' },
  typeChipActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  typeChipText: { fontSize: 13, color: '#555' },
  locationBtn: { backgroundColor: '#eff6ff', padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 8 },
  locationBtnText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  row: { flexDirection: 'row', gap: 10 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: '#666', fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#2563eb', alignItems: 'center' },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
