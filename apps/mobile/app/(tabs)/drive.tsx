import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTripStore } from '../../src/stores/tripStore';
import { useAutoTripStore } from '../../src/stores/autoTripStore';
import { useAuthStore } from '../../src/stores/authStore';
import { supabase } from '../../src/lib/supabase';
import {
  startLocationTracking,
  stopLocationTracking,
  getCurrentPosition,
  reverseGeocode,
} from '../../src/services/location';
import TripCompletionModal from '../../src/components/TripCompletionModal';
import { totalGpsDistance } from '@korjournal/shared';
import { useObd2, OBD2_STATUS_LABEL } from '../../src/hooks/useObd2';

function formatElapsed(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [
    hrs.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0'),
  ].join(':');
}

export default function DriveScreen() {
  const {
    isTracking,
    currentTrip,
    gpsPoints,
    elapsedSeconds,
    incrementElapsed,
    startTrip,
    stopTrip,
    error,
  } = useTripStore();

  const { isAutoMode, pendingTripEnd, setPendingTripEnd } = useAutoTripStore();
  const obd2 = useObd2();
  const { profile } = useAuthStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start trip form state
  const [showStartForm, setShowStartForm] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [startAddress, setStartAddress] = useState('');
  const [odometerStart, setOdometerStart] = useState('');
  const [tripType, setTripType] = useState<'business' | 'private'>('business');
  const [starting, setStarting] = useState(false);

  // Completion modal
  const [showCompletion, setShowCompletion] = useState(false);
  const [endAddress, setEndAddress] = useState('');

  // Fetch vehicles
  const { data: vehicles } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const { data } = await supabase
        .from('vehicles')
        .select('id, registration_number, make, model, current_odometer')
        .eq('is_active', true)
        .order('registration_number');
      return data ?? [];
    },
  });

  // Fetch customers for completion modal
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      return data ?? [];
    },
  });

  // Timer
  useEffect(() => {
    if (isTracking) {
      timerRef.current = setInterval(() => incrementElapsed(), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTracking]);

  // Show completion modal when auto-trip ends (pendingTripEnd flag)
  useEffect(() => {
    if (pendingTripEnd && currentTrip) {
      (async () => {
        try {
          const position = await getCurrentPosition();
          const addr = await reverseGeocode(position.coords.latitude, position.coords.longitude);
          setEndAddress(addr);
        } catch {
          setEndAddress('');
        }
        setShowCompletion(true);
        setPendingTripEnd(false);
      })();
    }
  }, [pendingTripEnd]);

  // Auto-fill start address from GPS
  const handlePrepareStart = async () => {
    setShowStartForm(true);
    try {
      const position = await getCurrentPosition();
      const addr = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      setStartAddress(addr);
    } catch {
      // User will fill in manually
    }

    // Pre-fill odometer from last vehicle reading
    if (selectedVehicleId && vehicles) {
      const vehicle = vehicles.find((v) => v.id === selectedVehicleId);
      if (vehicle?.current_odometer) {
        setOdometerStart(vehicle.current_odometer.toString());
      }
    }
  };

  // Update odometer when vehicle changes
  useEffect(() => {
    if (selectedVehicleId && vehicles) {
      const vehicle = vehicles.find((v) => v.id === selectedVehicleId);
      if (vehicle?.current_odometer) {
        setOdometerStart(vehicle.current_odometer.toString());
      }
    }
  }, [selectedVehicleId]);

  const handleStartTrip = async () => {
    if (!selectedVehicleId || !odometerStart || !profile) {
      Alert.alert('Fyll i alla fält', 'Välj fordon och ange mätarställning.');
      return;
    }

    setStarting(true);
    try {
      await startTrip({
        vehicleId: selectedVehicleId,
        driverId: profile.id,
        organizationId: profile.organization_id,
        startAddress: startAddress || 'Okänd adress',
        odometerStart: parseInt(odometerStart, 10),
        tripType,
      });
      await startLocationTracking();
      setShowStartForm(false);
    } catch (err) {
      Alert.alert('Fel', 'Kunde inte starta resa. Kontrollera din internetanslutning.');
    } finally {
      setStarting(false);
    }
  };

  const handleStopTrip = async () => {
    try {
      await stopLocationTracking();
      // Get current position for end address
      const position = await getCurrentPosition();
      const addr = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      setEndAddress(addr);
    } catch {
      setEndAddress('');
    }
    setShowCompletion(true);
  };

  const handleCompleteTrip = async (data: {
    endAddress: string;
    odometerEnd: number;
    purpose: string;
    visitedPerson: string;
    tripType: 'business' | 'private';
    customerId?: string;
  }) => {
    try {
      await stopTrip({
        endAddress: data.endAddress,
        odometerEnd: data.odometerEnd,
        purpose: data.purpose,
        visitedPerson: data.visitedPerson,
        customerId: data.customerId,
      });
      setShowCompletion(false);
      // Reset form
      setStartAddress('');
      setOdometerStart('');
      Alert.alert('Resa avslutad', 'Din resa har sparats i körjournalen.');
    } catch {
      Alert.alert('Fel', 'Kunde inte spara resan. Försök igen.');
    }
  };

  const currentDistance = gpsPoints.length > 1 ? totalGpsDistance(gpsPoints) : 0;

  // Auto-mode: show waiting state when no trip is active
  const showAutoModeWaiting = isAutoMode && !isTracking && !showStartForm && !showCompletion;
  const showManualStart = !isAutoMode && !isTracking && !showStartForm;

  return (
    <View style={styles.container}>
      {/* Status Card */}
      <View style={[styles.statusCard, isTracking && styles.statusCardActive]}>
        <Text style={styles.statusLabel}>
          {isTracking
            ? 'Resa pågår'
            : showAutoModeWaiting
              ? 'Automatiskt läge aktivt'
              : 'Ingen aktiv resa'}
        </Text>
        <Text style={styles.timer}>{formatElapsed(elapsedSeconds)}</Text>
        {isTracking && (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{currentDistance.toFixed(1)}</Text>
              <Text style={styles.statLabel}>km</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{gpsPoints.length}</Text>
              <Text style={styles.statLabel}>GPS-punkter</Text>
            </View>
          </View>
        )}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Auto-mode waiting state */}
      {showAutoModeWaiting && (
        <View style={styles.autoModeBox}>
          <Text style={styles.autoModeIcon}>📡</Text>
          <Text style={styles.autoModeTitle}>Väntar på att du börjar köra...</Text>
          <Text style={styles.autoModeText}>
            Resan startas automatiskt när bilen börjar röra sig.
            GPS-hastighet och distans övervakas i bakgrunden.
          </Text>
          <TouchableOpacity
            style={styles.manualOverrideBtn}
            onPress={handlePrepareStart}
            activeOpacity={0.7}
          >
            <Text style={styles.manualOverrideText}>Starta manuellt istället</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Start Trip Form */}
      {showStartForm && !isTracking && (
        <ScrollView style={styles.formCard}>
          <Text style={styles.formTitle}>Ny resa</Text>

          {/* Trip Type */}
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeBtn, tripType === 'business' && styles.typeBtnActive]}
              onPress={() => setTripType('business')}
            >
              <Text style={[styles.typeBtnText, tripType === 'business' && styles.typeBtnTextActive]}>
                Tjänsteresa
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, tripType === 'private' && styles.typeBtnPrivate]}
              onPress={() => setTripType('private')}
            >
              <Text style={[styles.typeBtnText, tripType === 'private' && styles.typeBtnTextActive]}>
                Privatresa
              </Text>
            </TouchableOpacity>
          </View>

          {/* Vehicle Selection */}
          <Text style={styles.fieldLabel}>Fordon *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.vehicleList}>
            {vehicles?.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[styles.vehicleChip, selectedVehicleId === v.id && styles.vehicleChipActive]}
                onPress={() => setSelectedVehicleId(v.id)}
              >
                <Text style={[styles.vehicleChipText, selectedVehicleId === v.id && styles.vehicleChipTextActive]}>
                  {v.registration_number}
                </Text>
                {v.make && (
                  <Text style={styles.vehicleChipSub}>
                    {v.make} {v.model ?? ''}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.fieldLabel}>Startadress</Text>
          <TextInput
            style={styles.input}
            value={startAddress}
            onChangeText={setStartAddress}
            placeholder="Hämtas via GPS..."
          />

          <Text style={styles.fieldLabel}>Mätarställning start (km) *</Text>
          <TextInput
            style={styles.input}
            value={odometerStart}
            onChangeText={setOdometerStart}
            keyboardType="numeric"
            placeholder="T.ex. 45200"
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
                if (value !== null) setOdometerStart(value.toString());
              }}
              disabled={obd2.isBusy}
            >
              <Text style={styles.obd2ButtonText}>
                {obd2.isBusy ? '...' : 'Läs från OBD2'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setShowStartForm(false)}
            >
              <Text style={styles.cancelBtnText}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmStartBtn, (!selectedVehicleId || !odometerStart) && styles.btnDisabled]}
              onPress={handleStartTrip}
              disabled={!selectedVehicleId || !odometerStart || starting}
            >
              {starting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmStartBtnText}>Starta resa</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Main Action Button — tracking active (both manual and auto-mode can stop) */}
      {isTracking && (
        <View style={styles.actionArea}>
          <TouchableOpacity style={styles.stopButton} onPress={handleStopTrip} activeOpacity={0.8}>
            <Text style={styles.stopButtonText}>Avsluta resa</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Manual mode: show start button */}
      {showManualStart && (
        <View style={styles.actionArea}>
          <TouchableOpacity style={styles.startButton} onPress={handlePrepareStart} activeOpacity={0.8}>
            <Text style={styles.startButtonText}>Starta resa</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Info — only show in manual mode */}
      {showManualStart && (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Hur det fungerar</Text>
          <Text style={styles.infoText}>
            1. Tryck "Starta resa" och välj fordon{'\n'}
            2. GPS spårar automatiskt din rutt{'\n'}
            3. Avsluta resan och fyll i Skatteverkets uppgifter{'\n'}
            4. Resan sparas i din körjournal
          </Text>
        </View>
      )}

      {/* Trip Completion Modal — mandatory fields for Skatteverket */}
      <TripCompletionModal
        visible={showCompletion}
        endAddress={endAddress}
        onComplete={handleCompleteTrip}
        onCancel={() => {
          setShowCompletion(false);
          // Resume tracking if cancelled — trip must be completed
          if (currentTrip) {
            startLocationTracking();
          }
        }}
        suggestedOdometerEnd={
          odometerStart && currentDistance
            ? parseInt(odometerStart, 10) + Math.round(currentDistance)
            : undefined
        }
        customers={customers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  statusCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 28,
    alignItems: 'center', borderWidth: 1, borderColor: '#e5e5e5', marginBottom: 16,
  },
  statusCardActive: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  statusLabel: { fontSize: 15, color: '#888', fontWeight: '500', marginBottom: 8 },
  timer: { fontSize: 48, fontWeight: '700', color: '#111', fontVariant: ['tabular-nums'] },
  statsRow: { flexDirection: 'row', marginTop: 16, gap: 32 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: '#16a34a' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  errorBox: {
    backgroundColor: '#fef2f2', borderRadius: 10, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#fecaca',
  },
  errorText: { color: '#dc2626', fontSize: 14 },
  autoModeBox: {
    backgroundColor: '#eff6ff', borderRadius: 16, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 16,
  },
  autoModeIcon: { fontSize: 36, marginBottom: 12 },
  autoModeTitle: { fontSize: 17, fontWeight: '700', color: '#1e40af', marginBottom: 8 },
  autoModeText: { fontSize: 14, color: '#1e40af', lineHeight: 22, textAlign: 'center', marginBottom: 16 },
  manualOverrideBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#93c5fd',
  },
  manualOverrideText: { fontSize: 14, color: '#2563eb', fontWeight: '600' },
  formCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#e5e5e5', maxHeight: 420,
  },
  formTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 16 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 2,
    borderColor: '#e5e5e5', alignItems: 'center',
  },
  typeBtnActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  typeBtnPrivate: { borderColor: '#9333ea', backgroundColor: '#faf5ff' },
  typeBtnText: { fontSize: 14, fontWeight: '600', color: '#999' },
  typeBtnTextActive: { color: '#111' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 12 },
  vehicleList: { flexDirection: 'row', marginBottom: 4 },
  vehicleChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#ddd', marginRight: 8, backgroundColor: '#fafafa',
  },
  vehicleChipActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  vehicleChipText: { fontSize: 14, fontWeight: '700', color: '#333' },
  vehicleChipTextActive: { color: '#2563eb' },
  vehicleChipSub: { fontSize: 11, color: '#888', marginTop: 2 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, backgroundColor: '#fafafa',
  },
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
  formActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1,
    borderColor: '#ddd', alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, color: '#666', fontWeight: '600' },
  confirmStartBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    backgroundColor: '#16a34a', alignItems: 'center',
  },
  confirmStartBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
  btnDisabled: { backgroundColor: '#86efac' },
  actionArea: { marginBottom: 16 },
  startButton: {
    backgroundColor: '#16a34a', borderRadius: 16, paddingVertical: 22, alignItems: 'center',
  },
  startButtonText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  stopButton: {
    backgroundColor: '#dc2626', borderRadius: 16, paddingVertical: 22, alignItems: 'center',
  },
  stopButtonText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  infoBox: {
    backgroundColor: '#eff6ff', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  infoTitle: { fontSize: 15, fontWeight: '600', color: '#1e40af', marginBottom: 8 },
  infoText: { fontSize: 14, color: '#1e40af', lineHeight: 22 },
});
