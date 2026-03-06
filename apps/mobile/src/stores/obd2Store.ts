import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'obd2-settings';

interface Obd2State {
  isConnected: boolean;
  deviceName: string | null;
  deviceId: string | null;
  adapterStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  currentSpeed: number | null;
  currentRPM: number | null;
  odometer: number | null;
  batteryVoltage: number | null;
  pairedDeviceId: string | null;
  pairedDeviceName: string | null;
  error: string | null;

  setConnected: (connected: boolean, deviceName?: string | null, deviceId?: string | null) => void;
  setAdapterStatus: (status: Obd2State['adapterStatus']) => void;
  setSpeed: (speed: number | null) => void;
  setRPM: (rpm: number | null) => void;
  setOdometer: (odometer: number | null) => void;
  setBatteryVoltage: (voltage: number | null) => void;
  setPairedDevice: (deviceId: string | null, deviceName: string | null) => void;
  setError: (error: string | null) => void;
  clearLiveData: () => void;
  hydrate: () => Promise<void>;
}

export const useObd2Store = create<Obd2State>((set, get) => ({
  isConnected: false,
  deviceName: null,
  deviceId: null,
  adapterStatus: 'disconnected',
  currentSpeed: null,
  currentRPM: null,
  odometer: null,
  batteryVoltage: null,
  pairedDeviceId: null,
  pairedDeviceName: null,
  error: null,

  setConnected: (connected, deviceName = null, deviceId = null) => {
    set({
      isConnected: connected,
      deviceName: connected ? deviceName : null,
      deviceId: connected ? deviceId : null,
      adapterStatus: connected ? 'connected' : 'disconnected',
      error: null,
    });
  },

  setAdapterStatus: (status) => set({ adapterStatus: status }),

  setSpeed: (speed) => set({ currentSpeed: speed }),
  setRPM: (rpm) => set({ currentRPM: rpm }),
  setOdometer: (odometer) => set({ odometer }),
  setBatteryVoltage: (voltage) => set({ batteryVoltage: voltage }),

  setPairedDevice: (deviceId, deviceName) => {
    set({ pairedDeviceId: deviceId, pairedDeviceName: deviceName });
    const data = { pairedDeviceId: deviceId, pairedDeviceName: deviceName };
    SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(data)).catch(console.error);
  },

  setError: (error) => set({ error, adapterStatus: error ? 'error' : get().adapterStatus }),

  clearLiveData: () => {
    set({
      currentSpeed: null,
      currentRPM: null,
      odometer: null,
      batteryVoltage: null,
    });
  },

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          pairedDeviceId: parsed.pairedDeviceId ?? null,
          pairedDeviceName: parsed.pairedDeviceName ?? null,
        });
      }
    } catch {
      // Ignore hydration errors
    }
  },
}));
