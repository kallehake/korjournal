import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import type { DashboardStats } from '@korjournal/shared';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { profile } = useAuthStore();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalTrips: 0,
    totalDistanceKm: 0,
    businessTrips: 0,
    privateTrips: 0,
    businessDistanceKm: 0,
    privateDistanceKm: 0,
    activeVehicles: 0,
    activeDrivers: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      const { data: trips, error } = await supabase
        .from('trips')
        .select('trip_type, distance_km, status')
        .eq('status', 'completed');

      if (error) throw error;

      const computed: DashboardStats = {
        totalTrips: trips?.length ?? 0,
        totalDistanceKm: 0,
        businessTrips: 0,
        privateTrips: 0,
        businessDistanceKm: 0,
        privateDistanceKm: 0,
        activeVehicles: 0,
        activeDrivers: 0,
      };

      trips?.forEach((trip) => {
        const dist = trip.distance_km ?? 0;
        computed.totalDistanceKm += dist;

        if (trip.trip_type === 'business') {
          computed.businessTrips++;
          computed.businessDistanceKm += dist;
        } else {
          computed.privateTrips++;
          computed.privateDistanceKm += dist;
        }
      });

      // Fetch active vehicles count
      const { count: vehicleCount } = await supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      computed.activeVehicles = vehicleCount ?? 0;

      setStats(computed);
    } catch (err) {
      console.error('Kunde inte hamta statistik:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a56db" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.greeting}>
        <Text style={styles.greetingText}>
          Hej, {profile?.full_name ?? 'Anvandare'}!
        </Text>
        <Text style={styles.greetingSubtext}>
          Har ar din oversikt
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Totalt resor" value={stats.totalTrips} />
        <StatCard
          label="Total stracka"
          value={`${Math.round(stats.totalDistanceKm)} km`}
        />
        <StatCard label="Tjansteresor" value={stats.businessTrips} />
        <StatCard label="Privata resor" value={stats.privateTrips} />
        <StatCard
          label="Tjanst km"
          value={`${Math.round(stats.businessDistanceKm)} km`}
        />
        <StatCard
          label="Privat km"
          value={`${Math.round(stats.privateDistanceKm)} km`}
        />
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Aktiva fordon</Text>
        <Text style={styles.infoValue}>{stats.activeVehicles}</Text>
      </View>

      {/* Quick actions */}
      <View style={styles.quickActions}>
        <Text style={styles.quickActionsTitle}>Snabbåtgärder</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: '#eff6ff' }]}
            onPress={() => router.push('/export')}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>📊</Text>
            <Text style={styles.actionLabel}>Exportera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: '#f0fdf4' }]}
            onPress={() => router.push('/fuel')}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>⛽</Text>
            <Text style={styles.actionLabel}>Tanka</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: '#faf5ff' }]}
            onPress={() => router.push('/checklist')}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>✅</Text>
            <Text style={styles.actionLabel}>Kontroll</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  greeting: {
    marginBottom: 24,
  },
  greetingText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  greetingSubtext: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    width: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a56db',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  infoValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a56db',
  },
  quickActions: { marginTop: 16 },
  quickActionsTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 10 },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionCard: {
    flex: 1, borderRadius: 12, padding: 16, alignItems: 'center',
  },
  actionIcon: { fontSize: 24, marginBottom: 6 },
  actionLabel: { fontSize: 13, fontWeight: '600', color: '#333' },
});
