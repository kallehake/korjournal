import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { useObd2Store } from '../src/stores/obd2Store';
import {
  scanForAdapters,
  stopScanning,
  connect,
  disconnect,
  readSpeed,
  readRPM,
  readOdometer,
  readBatteryVoltage,
  isConnected as checkConnected,
} from '../src/services/obd2';

interface FoundDevice {
  id: string;
  name: string;
}

export default function Obd2Screen() {
  const {
    isConnected,
    deviceName,
    adapterStatus,
    currentSpeed,
    currentRPM,
    odometer,
    batteryVoltage,
    pairedDeviceId,
    pairedDeviceName,
    error,
    setConnected,
    setAdapterStatus,
    setSpeed,
    setRPM,
    setOdometer,
    setBatteryVoltage,
    setPairedDevice,
    setError,
    clearLiveData,
    hydrate,
  } = useObd2Store();

  const [scanning, setScanning] = useState(false);
  const [foundDevices, setFoundDevices] = useState<FoundDevice[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    hydrate();
  }, []);

  const handleScan = async () => {
    setScanning(true);
    setFoundDevices([]);
    setError(null);

    try {
      await scanForAdapters((device) => {
        const name = device.name || device.localName || 'Okänd enhet';
        setFoundDevices((prev) => {
          if (prev.some((d) => d.id === device.id)) return prev;
          return [...prev, { id: device.id, name }];
        });
      }, 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Skanningsfel');
    } finally {
      setScanning(false);
    }
  };

  const handleConnect = async (deviceId: string, name: string) => {
    setConnecting(true);
    setAdapterStatus('connecting');
    setError(null);

    try {
      await connect(deviceId);
      setConnected(true, name, deviceId);
      setPairedDevice(deviceId, name);

      // Start polling live data
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anslutningsfel');
      setAdapterStatus('error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    stopPollingData();
    await disconnect();
    setConnected(false);
    clearLiveData();
  };

  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const startPolling = () => {
    setPolling(true);
    pollInterval = setInterval(async () => {
      if (!checkConnected()) {
        stopPollingData();
        return;
      }

      try {
        const speed = await readSpeed();
        setSpeed(speed);
      } catch { /* PID might not be supported */ }

      try {
        const rpm = await readRPM();
        setRPM(rpm);
      } catch { /* PID might not be supported */ }

      try {
        const voltage = await readBatteryVoltage();
        setBatteryVoltage(voltage);
      } catch { /* Might fail */ }

      try {
        const odo = await readOdometer();
        setOdometer(odo);
      } catch { /* Not all vehicles support odometer via OBD2 */ }
    }, 2000);
  };

  const stopPollingData = () => {
    setPolling(false);
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  const handleUnpair = () => {
    Alert.alert(
      'Glöm enhet',
      `Vill du ta bort ihopparningen med ${pairedDeviceName}?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Ta bort',
          style: 'destructive',
          onPress: async () => {
            await handleDisconnect();
            setPairedDevice(null, null);
          },
        },
      ],
    );
  };

  const statusColor =
    adapterStatus === 'connected' ? '#16a34a' :
    adapterStatus === 'connecting' ? '#f59e0b' :
    adapterStatus === 'error' ? '#dc2626' : '#9ca3af';

  return (
    <>
      <Stack.Screen options={{ title: 'OBD2-adapter', headerBackTitle: 'Tillbaka' }} />
      <ScrollView style={styles.container}>
        {/* Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.statusText}>
              {adapterStatus === 'connected' && deviceName
                ? `Ansluten: ${deviceName}`
                : adapterStatus === 'connecting'
                  ? 'Ansluter...'
                  : adapterStatus === 'error'
                    ? 'Fel vid anslutning'
                    : 'Ej ansluten'}
            </Text>
          </View>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        {/* Paired device */}
        {pairedDeviceId && !isConnected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ihopparad enhet</Text>
            <View style={styles.pairedCard}>
              <View>
                <Text style={styles.pairedName}>{pairedDeviceName ?? 'Okänd'}</Text>
                <Text style={styles.pairedId}>{pairedDeviceId}</Text>
              </View>
              <View style={styles.pairedActions}>
                <TouchableOpacity
                  style={styles.connectBtn}
                  onPress={() => handleConnect(pairedDeviceId, pairedDeviceName ?? 'OBD2')}
                  disabled={connecting}
                >
                  {connecting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.connectBtnText}>Anslut</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.unpairBtn} onPress={handleUnpair}>
                  <Text style={styles.unpairBtnText}>Glöm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Connected — Live Data */}
        {isConnected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Live-data</Text>
            <View style={styles.liveGrid}>
              <View style={styles.liveCard}>
                <Text style={styles.liveValue}>
                  {currentSpeed !== null ? `${currentSpeed}` : '--'}
                </Text>
                <Text style={styles.liveLabel}>km/h</Text>
              </View>
              <View style={styles.liveCard}>
                <Text style={styles.liveValue}>
                  {currentRPM !== null ? `${currentRPM}` : '--'}
                </Text>
                <Text style={styles.liveLabel}>RPM</Text>
              </View>
              <View style={styles.liveCard}>
                <Text style={styles.liveValue}>
                  {odometer !== null ? `${odometer}` : '--'}
                </Text>
                <Text style={styles.liveLabel}>Mätarst. km</Text>
              </View>
              <View style={styles.liveCard}>
                <Text style={styles.liveValue}>
                  {batteryVoltage !== null ? `${batteryVoltage.toFixed(1)}` : '--'}
                </Text>
                <Text style={styles.liveLabel}>Volt</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
              <Text style={styles.disconnectBtnText}>Koppla från</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Scan for devices */}
        {!isConnected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sök efter OBD2-adaptrar</Text>
            <TouchableOpacity
              style={styles.scanBtn}
              onPress={handleScan}
              disabled={scanning}
            >
              {scanning ? (
                <>
                  <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.scanBtnText}>Söker...</Text>
                </>
              ) : (
                <Text style={styles.scanBtnText}>Starta BLE-skanning</Text>
              )}
            </TouchableOpacity>

            {foundDevices.length > 0 && (
              <View style={styles.deviceList}>
                {foundDevices.map((device) => (
                  <TouchableOpacity
                    key={device.id}
                    style={styles.deviceItem}
                    onPress={() => handleConnect(device.id, device.name)}
                    disabled={connecting}
                  >
                    <View>
                      <Text style={styles.deviceName}>{device.name}</Text>
                      <Text style={styles.deviceId}>{device.id}</Text>
                    </View>
                    {connecting ? (
                      <ActivityIndicator size="small" color="#2563eb" />
                    ) : (
                      <Text style={styles.deviceArrow}>Anslut ›</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!scanning && foundDevices.length === 0 && (
              <Text style={styles.hintText}>
                Tryck "Starta BLE-skanning" för att söka efter OBD2-adaptrar i närheten.
                Se till att adaptern är inkopplad i bilens OBD2-port och att Bluetooth är aktiverat.
              </Text>
            )}
          </View>
        )}

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Om OBD2-anslutning</Text>
          <Text style={styles.infoText}>
            Appen stöder Bluetooth LE (BLE) OBD2-adaptrar som Vgate iCar Pro, Veepeak och
            andra ELM327-kompatibla enheter.{'\n\n'}
            Med en OBD2-adapter kan appen:{'\n'}
            - Läsa mätarställning automatiskt{'\n'}
            - Detektera bilstart/stopp för automatisk resloggning{'\n'}
            - Visa hastighet och RPM i realtid{'\n'}
            - Övervaka bilbatteriet
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  statusCard: {
    backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: '#e5e5e5',
  },
  statusHeader: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  statusText: { fontSize: 16, fontWeight: '600', color: '#333' },
  errorText: { color: '#dc2626', fontSize: 13, marginTop: 8 },
  section: { margin: 16, marginBottom: 0 },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#999',
    textTransform: 'uppercase', marginBottom: 10,
  },
  pairedCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#e5e5e5',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  pairedName: { fontSize: 16, fontWeight: '600', color: '#333' },
  pairedId: { fontSize: 12, color: '#999', marginTop: 2 },
  pairedActions: { flexDirection: 'row', gap: 8 },
  connectBtn: {
    backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 8,
  },
  connectBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  unpairBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#ddd',
  },
  unpairBtnText: { color: '#666', fontWeight: '600', fontSize: 14 },
  liveGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  liveCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    width: '47%', flexGrow: 1, alignItems: 'center',
    borderWidth: 1, borderColor: '#e5e5e5',
  },
  liveValue: { fontSize: 28, fontWeight: '700', color: '#1a56db' },
  liveLabel: { fontSize: 12, color: '#888', marginTop: 4 },
  disconnectBtn: {
    marginTop: 12, backgroundColor: '#fee2e2', paddingVertical: 12,
    borderRadius: 10, alignItems: 'center',
  },
  disconnectBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 15 },
  scanBtn: {
    backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
  },
  scanBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  deviceList: { marginTop: 12 },
  deviceItem: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: '#e5e5e5',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  deviceName: { fontSize: 15, fontWeight: '600', color: '#333' },
  deviceId: { fontSize: 11, color: '#999', marginTop: 2 },
  deviceArrow: { fontSize: 14, color: '#2563eb', fontWeight: '600' },
  hintText: { fontSize: 13, color: '#888', lineHeight: 20, marginTop: 12 },
  infoBox: {
    margin: 16, backgroundColor: '#eff6ff', borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: '#bfdbfe',
  },
  infoTitle: { fontSize: 15, fontWeight: '600', color: '#1e40af', marginBottom: 8 },
  infoText: { fontSize: 13, color: '#1e40af', lineHeight: 20 },
});
