import React from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../src/lib/supabase';
import { alertTypeLabels, formatDate, formatTime, type AlertType } from '@korjournal/shared';

const alertIcons: Record<AlertType, string> = {
  odometer_deviation: '⚠',
  driverless_trip: '👤',
  no_trips_7d: '📅',
  no_trips_14d: '📅',
  gps_lost: '📡',
  speed_violation: '🚗',
  missing_purpose: '📝',
  private_limit_exceeded: '🔒',
  checklist_failed: '❌',
};

export default function AlertsScreen() {
  const queryClient = useQueryClient();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('alerts')
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('alerts').update({ is_read: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const unreadCount = alerts?.filter((a) => !a.is_read).length ?? 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Varningar</Text>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount}</Text>
          </View>
        )}
      </View>

      {isLoading ? <ActivityIndicator style={{ marginTop: 40 }} /> : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, !item.is_read && styles.cardUnread]}
              onPress={() => !item.is_read && markReadMutation.mutate(item.id)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.icon}>
                  {alertIcons[item.alert_type as AlertType] ?? '⚠'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardType}>
                    {alertTypeLabels[item.alert_type as AlertType]}
                  </Text>
                </View>
                <Text style={styles.cardTime}>{formatDate(item.created_at)}</Text>
              </View>
              <Text style={styles.cardMessage}>{item.message}</Text>
              <TouchableOpacity
                style={styles.resolveBtn}
                onPress={() => resolveMutation.mutate(item.id)}
              >
                <Text style={styles.resolveBtnText}>Markera som åtgärdad</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Inga aktiva varningar</Text>
              <Text style={styles.emptyText}>Allt ser bra ut!</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  title: { fontSize: 20, fontWeight: '700' },
  badge: {
    backgroundColor: '#dc2626', borderRadius: 12, minWidth: 24, height: 24,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  list: { padding: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#eee',
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: '#dc2626' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  icon: { fontSize: 20, marginTop: 2 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  cardType: { fontSize: 12, color: '#888', marginTop: 2 },
  cardTime: { fontSize: 11, color: '#bbb' },
  cardMessage: { fontSize: 13, color: '#555', lineHeight: 20, marginBottom: 10 },
  resolveBtn: {
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 6, backgroundColor: '#f0fdf4',
  },
  resolveBtnText: { fontSize: 12, color: '#16a34a', fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#16a34a' },
  emptyText: { fontSize: 14, color: '#888', marginTop: 4 },
});
