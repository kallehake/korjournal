import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'auto-trip-settings';

interface AutoTripState {
  isAutoMode: boolean;
  defaultVehicleId: string | null;
  defaultTripType: 'business' | 'private';
  pendingTripEnd: boolean;
  isHydrated: boolean;

  setAutoMode: (enabled: boolean) => void;
  setDefaultVehicleId: (vehicleId: string | null) => void;
  setDefaultTripType: (tripType: 'business' | 'private') => void;
  setPendingTripEnd: (pending: boolean) => void;
  hydrate: () => Promise<void>;
}

export const useAutoTripStore = create<AutoTripState>((set, get) => ({
  isAutoMode: true,
  defaultVehicleId: null,
  defaultTripType: 'business',
  pendingTripEnd: false,
  isHydrated: false,

  setAutoMode: (enabled) => {
    set({ isAutoMode: enabled });
    persistState(get());
  },

  setDefaultVehicleId: (vehicleId) => {
    set({ defaultVehicleId: vehicleId });
    persistState(get());
  },

  setDefaultTripType: (tripType) => {
    set({ defaultTripType: tripType });
    persistState(get());
  },

  setPendingTripEnd: (pending) => {
    set({ pendingTripEnd: pending });
  },

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          isAutoMode: parsed.isAutoMode ?? true,
          defaultVehicleId: parsed.defaultVehicleId ?? null,
          defaultTripType: parsed.defaultTripType ?? 'business',
          isHydrated: true,
        });
      } else {
        set({ isHydrated: true });
      }
    } catch {
      set({ isHydrated: true });
    }
  },
}));

function persistState(state: AutoTripState) {
  const data = {
    isAutoMode: state.isAutoMode,
    defaultVehicleId: state.defaultVehicleId,
    defaultTripType: state.defaultTripType,
  };
  SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(data)).catch(console.error);
}
