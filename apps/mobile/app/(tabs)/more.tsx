import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { useAutoTripStore } from '../../src/stores/autoTripStore';

export default function MoreScreen() {
  const { profile, logout } = useAuthStore();
  const { isAutoMode, setAutoMode } = useAutoTripStore();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert('Logga ut', 'Är du säker på att du vill logga ut?', [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Logga ut', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.name}>{profile?.full_name ?? 'Användare'}</Text>
        <Text style={styles.email}>{profile?.email ?? ''}</Text>
        <Text style={styles.role}>
          {profile?.role === 'admin' ? 'Administratör' : 'Förare'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hantering</Text>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/vehicles')}>
          <Text style={styles.menuText}>Fordon</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/customers')}>
          <Text style={styles.menuText}>Kunder</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/geofences')}>
          <Text style={styles.menuText}>Geofences</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/fuel')}>
          <Text style={styles.menuText}>Bränsle</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/checklist')}>
          <Text style={styles.menuText}>Fordonskontroll</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/obd2')}>
          <Text style={styles.menuText}>OBD2-adapter</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Resedetektering</Text>

        <View style={styles.menuItem}>
          <Text style={styles.menuText}>Auto-detektion</Text>
          <Switch
            value={isAutoMode}
            onValueChange={setAutoMode}
            trackColor={{ false: '#ddd', true: '#93c5fd' }}
            thumbColor={isAutoMode ? '#2563eb' : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rapporter & Varningar</Text>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/alerts')}>
          <Text style={styles.menuText}>Varningar</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/export')}>
          <Text style={styles.menuText}>Exportera körjournal</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Om</Text>

        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>Integritetspolicy</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuText}>Villkor</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <View style={styles.menuItem}>
          <Text style={styles.menuText}>Version</Text>
          <Text style={styles.menuValue}>1.0.0</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logga ut</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  profileCard: {
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '600', color: '#111' },
  email: { fontSize: 14, color: '#666', marginTop: 2 },
  role: {
    fontSize: 12,
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
  },
  section: { marginTop: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuText: { fontSize: 16, color: '#333' },
  menuArrow: { fontSize: 20, color: '#ccc' },
  menuValue: { fontSize: 14, color: '#999' },
  logoutButton: {
    marginHorizontal: 16,
    marginTop: 32,
    backgroundColor: '#fee2e2',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  logoutText: { color: '#dc2626', fontSize: 16, fontWeight: '600' },
});
