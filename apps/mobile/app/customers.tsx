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

export default function CustomersScreen() {
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [orgNumber, setOrgNumber] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

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
    mutationFn: async () => {
      const customer = {
        name,
        org_number: orgNumber || null,
        contact_person: contactPerson || null,
        email: email || null,
        phone: phone || null,
      };

      if (editingId) {
        const { error } = await supabase.from('customers').update(customer).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('customers').insert({
          ...customer,
          organization_id: profile!.organization_id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      closeForm();
    },
    onError: () => Alert.alert('Fel', 'Kunde inte spara kund'),
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName('');
    setOrgNumber('');
    setContactPerson('');
    setEmail('');
    setPhone('');
  };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setName(c.name);
    setOrgNumber(c.org_number ?? '');
    setContactPerson(c.contact_person ?? '');
    setEmail(c.email ?? '');
    setPhone(c.phone ?? '');
    setShowForm(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Kunder</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
          <Text style={styles.addBtnText}>+ Lägg till</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => openEdit(item)}>
              <Text style={styles.customerName}>{item.name}</Text>
              {item.org_number && <Text style={styles.orgNumber}>{item.org_number}</Text>}
              {item.contact_person && <Text style={styles.contact}>{item.contact_person}</Text>}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Inga kunder registrerade</Text>
          }
        />
      )}

      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.formContainer}>
          <Text style={styles.formTitle}>{editingId ? 'Redigera kund' : 'Ny kund'}</Text>

          <Text style={styles.label}>Namn *</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Företagsnamn" />

          <Text style={styles.label}>Organisationsnummer</Text>
          <TextInput style={styles.input} value={orgNumber} onChangeText={setOrgNumber} placeholder="556xxx-xxxx" />

          <Text style={styles.label}>Kontaktperson</Text>
          <TextInput style={styles.input} value={contactPerson} onChangeText={setContactPerson} />

          <Text style={styles.label}>E-post</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail}
            keyboardType="email-address" autoCapitalize="none" />

          <Text style={styles.label}>Telefon</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={closeForm}>
              <Text style={styles.cancelBtnText}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={() => saveMutation.mutate()}
              disabled={!name || saveMutation.isPending}>
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
  title: { fontSize: 20, fontWeight: '700', color: '#111' },
  addBtn: { backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  list: { padding: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#eee',
  },
  customerName: { fontSize: 16, fontWeight: '700', color: '#111' },
  orgNumber: { fontSize: 13, color: '#666', marginTop: 4 },
  contact: { fontSize: 13, color: '#888', marginTop: 2 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 16 },
  formContainer: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 60 },
  formTitle: { fontSize: 22, fontWeight: '700', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1,
    borderColor: '#ddd', alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, color: '#666', fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#2563eb', alignItems: 'center' },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
