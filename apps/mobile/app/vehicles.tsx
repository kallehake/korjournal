import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/stores/authStore';
import { formatOdometer } from '@korjournal/shared';

export default function VehiclesScreen() {
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [regNumber, setRegNumber] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [odometer, setOdometer] = useState('');

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
    mutationFn: async () => {
      const vehicle = {
        registration_number: regNumber.toUpperCase(),
        make: make || null,
        model: model || null,
        current_odometer: odometer ? parseInt(odometer, 10) : null,
      };

      if (editingId) {
        const { error } = await supabase.from('vehicles').update(vehicle).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vehicles').insert({
          ...vehicle,
          organization_id: profile!.organization_id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      closeForm();
    },
    onError: () => Alert.alert('Fel', 'Kunde inte spara fordon'),
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setRegNumber('');
    setMake('');
    setModel('');
    setOdometer('');
  };

  const openEdit = (v: any) => {
    setEditingId(v.id);
    setRegNumber(v.registration_number);
    setMake(v.make ?? '');
    setModel(v.model ?? '');
    setOdometer(v.current_odometer?.toString() ?? '');
    setShowForm(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Fordon</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
          <Text style={styles.addBtnText}>+ Lägg till</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => openEdit(item)}>
              <Text style={styles.regNumber}>{item.registration_number}</Text>
              <Text style={styles.vehicleInfo}>
                {[item.make, item.model, item.year].filter(Boolean).join(' ')}
              </Text>
              {item.current_odometer && (
                <Text style={styles.odometer}>{formatOdometer(item.current_odometer)}</Text>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Inga fordon registrerade</Text>
          }
        />
      )}

      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.formContainer}>
          <Text style={styles.formTitle}>{editingId ? 'Redigera fordon' : 'Nytt fordon'}</Text>

          <Text style={styles.label}>Registreringsnummer *</Text>
          <TextInput style={styles.input} value={regNumber} onChangeText={setRegNumber}
            placeholder="ABC123" autoCapitalize="characters" />

          <Text style={styles.label}>Märke</Text>
          <TextInput style={styles.input} value={make} onChangeText={setMake} placeholder="Volvo" />

          <Text style={styles.label}>Modell</Text>
          <TextInput style={styles.input} value={model} onChangeText={setModel} placeholder="XC60" />

          <Text style={styles.label}>Mätarställning (km)</Text>
          <TextInput style={styles.input} value={odometer} onChangeText={setOdometer}
            keyboardType="numeric" placeholder="T.ex. 45000" />

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelFormBtn} onPress={closeForm}>
              <Text style={styles.cancelFormBtnText}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveFormBtn} onPress={() => saveMutation.mutate()}
              disabled={!regNumber || saveMutation.isPending}>
              <Text style={styles.saveFormBtnText}>
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
  title: { fontSize: 20, fontWeight: '700', color: '#111' },
  addBtn: { backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  list: { padding: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#eee',
  },
  regNumber: { fontSize: 18, fontWeight: '700', color: '#111' },
  vehicleInfo: { fontSize: 14, color: '#666', marginTop: 4 },
  odometer: { fontSize: 13, color: '#888', marginTop: 4 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 16 },
  formContainer: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 60 },
  formTitle: { fontSize: 22, fontWeight: '700', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelFormBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1,
    borderColor: '#ddd', alignItems: 'center',
  },
  cancelFormBtnText: { fontSize: 15, color: '#666', fontWeight: '600' },
  saveFormBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#2563eb', alignItems: 'center' },
  saveFormBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
