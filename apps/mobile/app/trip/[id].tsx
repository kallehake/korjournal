import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../src/lib/supabase';
import {
  formatDate,
  formatTime,
  formatDistance,
  formatOdometer,
  tripTypeLabel,
  tripStatusLabel,
} from '@korjournal/shared';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: trip, isLoading } = useQuery({
    queryKey: ['trip', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select(`
          *,
          driver:profiles!driver_id(full_name),
          vehicle:vehicles!vehicle_id(registration_number, make, model),
          customer:customers!customer_id(name)
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: gpsPoints } = useQuery({
    queryKey: ['gps_points', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('gps_points')
        .select('latitude, longitude')
        .eq('trip_id', id)
        .order('timestamp', { ascending: true });
      return data;
    },
    enabled: !!id,
  });

  // Edit form state
  const [editPurpose, setEditPurpose] = useState('');
  const [editVisited, setEditVisited] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('trips')
        .update({
          purpose: editPurpose || null,
          visited_person: editVisited || null,
          notes: editNotes || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', id] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setEditing(false);
    },
  });

  const startEditing = () => {
    if (trip) {
      setEditPurpose(trip.purpose ?? '');
      setEditVisited(trip.visited_person ?? '');
      setEditNotes(trip.notes ?? '');
      setEditing(true);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>Resa hittades inte</Text>
      </View>
    );
  }

  const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerDate}>{formatDate(trip.date)}</Text>
          <View style={[
            styles.badge,
            trip.trip_type === 'business' ? styles.badgeBusiness : styles.badgePrivate,
          ]}>
            <Text style={styles.badgeText}>{tripTypeLabel(trip.trip_type)}</Text>
          </View>
        </View>
        <Text style={styles.headerStatus}>{tripStatusLabel(trip.status)}</Text>
      </View>

      {/* Route */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Rutt</Text>
        <View style={styles.routeBox}>
          <View style={styles.routeDots}>
            <View style={[styles.dot, { backgroundColor: '#16a34a' }]} />
            <View style={styles.routeLine} />
            <View style={[styles.dot, { backgroundColor: '#dc2626' }]} />
          </View>
          <View style={styles.routeAddresses}>
            <Text style={styles.routeAddress}>{trip.start_address}</Text>
            <Text style={styles.routeAddress}>{trip.end_address ?? '—'}</Text>
          </View>
        </View>
      </View>

      {/* Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Detaljer</Text>
        <InfoRow label="Starttid" value={formatTime(trip.start_time)} />
        <InfoRow label="Sluttid" value={trip.end_time ? formatTime(trip.end_time) : null} />
        <InfoRow label="Fordon" value={
          trip.vehicle
            ? `${(trip.vehicle as any).registration_number} ${(trip.vehicle as any).make ?? ''}`
            : null
        } />
        <InfoRow label="Förare" value={(trip.driver as any)?.full_name} />
        <InfoRow label="Kund" value={(trip.customer as any)?.name} />
      </View>

      {/* Distance */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Körsträcka</Text>
        <InfoRow label="Mätarställning start" value={formatOdometer(trip.odometer_start)} />
        <InfoRow label="Mätarställning slut" value={formatOdometer(trip.odometer_end)} />
        <InfoRow label="Körd sträcka" value={formatDistance(trip.distance_km)} />
        <InfoRow label="GPS-sträcka" value={formatDistance(trip.distance_gps_km)} />
        {trip.distance_deviation_pct != null && trip.distance_deviation_pct > 5 && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Avvikelse: {trip.distance_deviation_pct.toFixed(1)}% mellan mätare och GPS
            </Text>
          </View>
        )}
      </View>

      {/* Purpose / Notes */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Ändamål</Text>
          {!editing && (
            <TouchableOpacity onPress={startEditing}>
              <Text style={styles.editLink}>Redigera</Text>
            </TouchableOpacity>
          )}
        </View>

        {editing ? (
          <>
            <Text style={styles.fieldLabel}>Ändamål</Text>
            <TextInput
              style={styles.input}
              value={editPurpose}
              onChangeText={setEditPurpose}
              placeholder="Ändamål med resan"
            />
            <Text style={styles.fieldLabel}>Besökt person/företag</Text>
            <TextInput
              style={styles.input}
              value={editVisited}
              onChangeText={setEditVisited}
              placeholder="Besökt person"
            />
            <Text style={styles.fieldLabel}>Anteckningar</Text>
            <TextInput
              style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
              value={editNotes}
              onChangeText={setEditNotes}
              multiline
              placeholder="Anteckningar"
            />
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
                <Text style={styles.cancelBtnText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
              >
                <Text style={styles.saveBtnText}>
                  {updateMutation.isPending ? 'Sparar...' : 'Spara'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <InfoRow label="Ändamål" value={trip.purpose} />
            <InfoRow label="Besökt" value={trip.visited_person} />
            <InfoRow label="Anteckningar" value={trip.notes} />
          </>
        )}
      </View>

      {/* GPS Points summary */}
      {gpsPoints && gpsPoints.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>GPS-data</Text>
          <Text style={styles.gpsInfo}>{gpsPoints.length} GPS-punkter registrerade</Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#999' },
  header: {
    backgroundColor: '#fff', padding: 20,
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerDate: { fontSize: 22, fontWeight: '700', color: '#111' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeBusiness: { backgroundColor: '#eff6ff' },
  badgePrivate: { backgroundColor: '#faf5ff' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#2563eb' },
  headerStatus: { fontSize: 14, color: '#888', marginTop: 4 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, margin: 12,
    marginBottom: 0, padding: 16,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 12 },
  editLink: { fontSize: 14, color: '#2563eb', fontWeight: '600' },
  routeBox: { flexDirection: 'row' },
  routeDots: { width: 24, alignItems: 'center', paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: { flex: 1, width: 2, backgroundColor: '#ddd', marginVertical: 3 },
  routeAddresses: { flex: 1, justifyContent: 'space-between', gap: 8, paddingVertical: 0 },
  routeAddress: { fontSize: 14, color: '#333' },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  infoLabel: { fontSize: 13, color: '#888' },
  infoValue: { fontSize: 14, fontWeight: '500', color: '#333' },
  warningBox: {
    backgroundColor: '#fffbeb', borderRadius: 8, padding: 10, marginTop: 8,
  },
  warningText: { fontSize: 13, color: '#d97706' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 4, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#ddd', alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, color: '#666' },
  saveBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#2563eb', alignItems: 'center',
  },
  saveBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  gpsInfo: { fontSize: 14, color: '#666' },
});
