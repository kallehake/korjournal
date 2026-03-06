import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import TripCard from '../../src/components/TripCard';

type FilterType = 'all' | 'business' | 'private';

export default function TripsScreen() {
  const router = useRouter();
  const [filterType, setFilterType] = useState<FilterType>('all');

  const { data: trips, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['trips', filterType],
    queryFn: async () => {
      let query = supabase
        .from('trips')
        .select(`
          *,
          vehicle:vehicles!vehicle_id(registration_number)
        `)
        .order('date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(100);

      if (filterType !== 'all') {
        query = query.eq('trip_type', filterType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['all', 'business', 'private'] as const).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.filterTab, filterType === type && styles.filterTabActive]}
            onPress={() => setFilterType(type)}
          >
            <Text style={[styles.filterTabText, filterType === type && styles.filterTabTextActive]}>
              {type === 'all' ? 'Alla' : type === 'business' ? 'Tjänst' : 'Privat'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TripCard
            trip={item}
            onPress={() => router.push(`/trip/${item.id}`)}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Inga resor än</Text>
            <Text style={styles.emptyText}>
              Starta din första resa från fliken "Kör"
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5',
  },
  filterRow: {
    flexDirection: 'row', padding: 12, gap: 8,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  filterTab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f0f0f0',
  },
  filterTabActive: { backgroundColor: '#2563eb' },
  filterTabText: { fontSize: 13, fontWeight: '600', color: '#666' },
  filterTabTextActive: { color: '#fff' },
  listContent: { padding: 12 },
  emptyContainer: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#999', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#bbb' },
});
