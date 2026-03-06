import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useObd2, OBD2_STATUS_LABEL } from '../hooks/useObd2';

interface TripCompletionModalProps {
  visible: boolean;
  endAddress: string;
  onComplete: (data: {
    endAddress: string;
    odometerEnd: number;
    purpose: string;
    visitedPerson: string;
    tripType: 'business' | 'private';
    customerId?: string;
    notes?: string;
  }) => Promise<void>;
  onCancel: () => void;
  suggestedOdometerEnd?: number;
  customers?: Array<{ id: string; name: string }>;
}

export default function TripCompletionModal({
  visible,
  endAddress,
  onComplete,
  onCancel,
  suggestedOdometerEnd,
  customers = [],
}: TripCompletionModalProps) {
  const [address, setAddress] = useState(endAddress);
  const [odometerEnd, setOdometerEnd] = useState(suggestedOdometerEnd?.toString() ?? '');
  const [purpose, setPurpose] = useState('');
  const [visitedPerson, setVisitedPerson] = useState('');
  const [tripType, setTripType] = useState<'business' | 'private'>('business');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const obd2 = useObd2();

  const handleComplete = async () => {
    if (!odometerEnd) return;
    setLoading(true);
    try {
      await onComplete({
        endAddress: address,
        odometerEnd: parseInt(odometerEnd, 10),
        purpose,
        visitedPerson,
        tripType,
        customerId: selectedCustomer || undefined,
        notes: notes || undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Avsluta resa</Text>
        <Text style={styles.subtitle}>Fyll i uppgifter enligt Skatteverkets krav</Text>

        {/* Trip Type Toggle */}
        <View style={styles.typeToggle}>
          <TouchableOpacity
            style={[styles.typeButton, tripType === 'business' && styles.typeButtonActive]}
            onPress={() => setTripType('business')}
          >
            <Text style={[styles.typeButtonText, tripType === 'business' && styles.typeButtonTextActive]}>
              Tjänsteresa
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeButton, tripType === 'private' && styles.typeButtonPrivateActive]}
            onPress={() => setTripType('private')}
          >
            <Text style={[styles.typeButtonText, tripType === 'private' && styles.typeButtonTextActive]}>
              Privatresa
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Slutadress *</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Fyll i automatiskt via GPS"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Mätarställning slut (km) *</Text>
          <TextInput
            style={styles.input}
            value={odometerEnd}
            onChangeText={setOdometerEnd}
            keyboardType="numeric"
            placeholder="T.ex. 45230"
          />
          <View style={styles.obd2Row}>
            {obd2.status !== 'idle' && obd2.status !== 'error' && (
              <Text style={styles.obd2StatusText}>{OBD2_STATUS_LABEL[obd2.status]}</Text>
            )}
            {obd2.error && (
              <Text style={styles.obd2ErrorText} numberOfLines={2}>{obd2.error}</Text>
            )}
            <TouchableOpacity
              style={[styles.obd2Button, obd2.isBusy && styles.obd2ButtonDisabled]}
              onPress={async () => {
                obd2.reset();
                const value = await obd2.readOdometer();
                if (value !== null) setOdometerEnd(value.toString());
              }}
              disabled={obd2.isBusy}
            >
              <Text style={styles.obd2ButtonText}>
                {obd2.isBusy ? '...' : 'Läs från OBD2'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {tripType === 'business' && (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Ändamål / syfte</Text>
              <TextInput
                style={styles.input}
                value={purpose}
                onChangeText={setPurpose}
                placeholder="T.ex. Kundmöte, leverans"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Besökt person/företag</Text>
              <TextInput
                style={styles.input}
                value={visitedPerson}
                onChangeText={setVisitedPerson}
                placeholder="T.ex. Anna Svensson, AB Företag"
              />
            </View>

            {customers.length > 0 && (
              <View style={styles.field}>
                <Text style={styles.label}>Kund</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.customerList}>
                  <TouchableOpacity
                    style={[styles.customerChip, !selectedCustomer && styles.customerChipActive]}
                    onPress={() => setSelectedCustomer('')}
                  >
                    <Text style={[styles.customerChipText, !selectedCustomer && styles.customerChipTextActive]}>
                      Ingen
                    </Text>
                  </TouchableOpacity>
                  {customers.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.customerChip, selectedCustomer === c.id && styles.customerChipActive]}
                      onPress={() => setSelectedCustomer(c.id)}
                    >
                      <Text style={[styles.customerChipText, selectedCustomer === c.id && styles.customerChipTextActive]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Anteckningar</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            placeholder="Valfria anteckningar..."
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Avbryt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.completeButton, !odometerEnd && styles.completeButtonDisabled]}
            onPress={handleComplete}
            disabled={!odometerEnd || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.completeButtonText}>Avsluta resa</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
  typeToggle: { flexDirection: 'row', marginBottom: 20, gap: 8 },
  typeButton: {
    flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 2,
    borderColor: '#e5e5e5', alignItems: 'center',
  },
  typeButtonActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  typeButtonPrivateActive: { borderColor: '#9333ea', backgroundColor: '#faf5ff' },
  typeButtonText: { fontSize: 15, fontWeight: '600', color: '#999' },
  typeButtonTextActive: { color: '#111' },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, backgroundColor: '#fafafa',
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  obd2Row: {
    flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8, flexWrap: 'wrap',
  },
  obd2StatusText: { flex: 1, fontSize: 12, color: '#2563eb' },
  obd2ErrorText: { flex: 1, fontSize: 12, color: '#dc2626' },
  obd2Button: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: '#2563eb', marginLeft: 'auto',
  },
  obd2ButtonDisabled: { borderColor: '#93c5fd' },
  obd2ButtonText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  customerList: { flexDirection: 'row', marginTop: 4 },
  customerChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#ddd', marginRight: 8, backgroundColor: '#fff',
  },
  customerChipActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  customerChipText: { fontSize: 13, color: '#666' },
  customerChipTextActive: { color: '#2563eb', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 40 },
  cancelButton: {
    flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1,
    borderColor: '#ddd', alignItems: 'center',
  },
  cancelButtonText: { fontSize: 16, color: '#666', fontWeight: '600' },
  completeButton: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    backgroundColor: '#2563eb', alignItems: 'center',
  },
  completeButtonDisabled: { backgroundColor: '#93c5fd' },
  completeButtonText: { fontSize: 16, color: '#fff', fontWeight: '700' },
});
