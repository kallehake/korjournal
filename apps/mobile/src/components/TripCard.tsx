import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatDate, formatTime, formatDistance, tripTypeLabel } from '@korjournal/shared';

interface TripCardProps {
  trip: {
    id: string;
    date: string;
    start_time: string;
    end_time: string | null;
    start_address: string;
    end_address: string | null;
    distance_km: number | null;
    trip_type: 'business' | 'private';
    status: string;
    purpose: string | null;
    vehicle?: { registration_number: string } | null;
  };
  onPress: () => void;
}

export default function TripCard({ trip, onPress }: TripCardProps) {
  const isBusiness = trip.trip_type === 'business';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <Text style={styles.date}>{formatDate(trip.date)}</Text>
        <View style={[styles.badge, isBusiness ? styles.badgeBusiness : styles.badgePrivate]}>
          <Text style={[styles.badgeText, isBusiness ? styles.badgeTextBusiness : styles.badgeTextPrivate]}>
            {tripTypeLabel(trip.trip_type)}
          </Text>
        </View>
      </View>

      <View style={styles.route}>
        <View style={styles.routeLine}>
          <View style={[styles.dot, styles.dotStart]} />
          <View style={styles.line} />
          <View style={[styles.dot, styles.dotEnd]} />
        </View>
        <View style={styles.addresses}>
          <Text style={styles.address} numberOfLines={1}>{trip.start_address}</Text>
          <Text style={styles.address} numberOfLines={1}>{trip.end_address ?? '—'}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {formatTime(trip.start_time)}
          {trip.end_time ? ` — ${formatTime(trip.end_time)}` : ''}
        </Text>
        <Text style={styles.footerText}>{formatDistance(trip.distance_km)}</Text>
        {trip.vehicle && (
          <Text style={styles.footerTextLight}>{trip.vehicle.registration_number}</Text>
        )}
      </View>

      {trip.purpose && (
        <Text style={styles.purpose} numberOfLines={1}>{trip.purpose}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  date: { fontSize: 14, fontWeight: '600', color: '#333' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeBusiness: { backgroundColor: '#eff6ff' },
  badgePrivate: { backgroundColor: '#faf5ff' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextBusiness: { color: '#2563eb' },
  badgeTextPrivate: { color: '#9333ea' },
  route: { flexDirection: 'row', marginBottom: 10 },
  routeLine: { width: 20, alignItems: 'center', paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotStart: { backgroundColor: '#16a34a' },
  dotEnd: { backgroundColor: '#dc2626' },
  line: { flex: 1, width: 2, backgroundColor: '#ddd', marginVertical: 2 },
  addresses: { flex: 1, justifyContent: 'space-between', paddingVertical: 1 },
  address: { fontSize: 13, color: '#555' },
  footer: { flexDirection: 'row', gap: 12 },
  footerText: { fontSize: 12, color: '#888' },
  footerTextLight: { fontSize: 12, color: '#bbb' },
  purpose: { fontSize: 12, color: '#888', marginTop: 6, fontStyle: 'italic' },
});
