import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'se.projektdirektiv.korjournal',
  appName: 'Korjournal',
  webDir: 'dist',
  android: {
    backgroundColor: '#ffffff',
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Söker efter OBD2-adapter...',
        cancel: 'Avbryt',
        availableDevices: 'Tillgängliga enheter',
        noDeviceFound: 'Ingen adapter hittades',
      },
    },
  },
};

export default config;
