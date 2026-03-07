import { BleClient } from '@capacitor-community/bluetooth-le';
import type { BleDevice, ScanResult } from '@capacitor-community/bluetooth-le';

// ELM327 / Vgate iCar Pro 2S BLE service/char UUIDs
const OBD_SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
const OBD_WRITE   = '0000fff2-0000-1000-8000-00805f9b34fb';
const OBD_NOTIFY  = '0000fff1-0000-1000-8000-00805f9b34fb';

// Known OBD adapter name prefixes
const OBD_NAME_PREFIXES = ['vgate', 'icar', 'elm327', 'obd', 'veepeak'];

let connectedDevice: BleDevice | null = null;

function isObd2Device(result: ScanResult): boolean {
  const name = (result.device.name ?? '').toLowerCase();
  return OBD_NAME_PREFIXES.some((p) => name.includes(p));
}

async function sendCommand(deviceId: string, cmd: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const encoded = encoder.encode(cmd + '\r');
  await BleClient.write(
    deviceId,
    OBD_SERVICE,
    OBD_WRITE,
    new DataView(encoded.buffer),
  );

  return new Promise((resolve) => {
    let response = '';
    const timeout = setTimeout(() => resolve(response.trim()), 1500);

    BleClient.startNotifications(deviceId, OBD_SERVICE, OBD_NOTIFY, (value) => {
      response += decoder.decode(value);
      if (response.includes('>')) {
        clearTimeout(timeout);
        BleClient.stopNotifications(deviceId, OBD_SERVICE, OBD_NOTIFY);
        resolve(response.trim());
      }
    });
  });
}

export async function initialize(): Promise<void> {
  await BleClient.initialize({ androidNeverForLocation: false });
}

export async function scanAndConnect(
  onStatus: (msg: string) => void,
): Promise<BleDevice | null> {
  onStatus('Söker efter OBD2-adapter...');

  return new Promise((resolve) => {
    let found = false;

    BleClient.requestLEScan({ allowDuplicates: false }, async (result) => {
      if (found) return;
      if (!isObd2Device(result)) return;

      found = true;
      onStatus(`Hittade ${result.device.name ?? 'OBD2'}, ansluter...`);

      try {
        await BleClient.stopLEScan();
        await BleClient.connect(result.device.deviceId);
        // Init ELM327
        await sendCommand(result.device.deviceId, 'ATZ');
        await sendCommand(result.device.deviceId, 'ATE0');
        await sendCommand(result.device.deviceId, 'ATL0');
        await sendCommand(result.device.deviceId, 'ATSP0');
        connectedDevice = result.device;
        onStatus('Ansluten');
        resolve(result.device);
      } catch {
        onStatus('Anslutning misslyckades');
        resolve(null);
      }
    });

    // Stop scan after 15 seconds
    setTimeout(async () => {
      if (!found) {
        await BleClient.stopLEScan();
        onStatus('Ingen adapter hittades');
        resolve(null);
      }
    }, 15000);
  });
}

export async function readSoc(deviceId: string): Promise<number | null> {
  try {
    // Mode 01 PID 5B — Hybrid battery remaining (0-100%)
    const raw = await sendCommand(deviceId, '015B');
    const parts = raw.replace(/[\r\n>]/g, ' ').trim().split(/\s+/);
    const idx = parts.findIndex((p) => p.toUpperCase() === '5B');
    if (idx >= 0 && parts[idx + 1]) {
      return Math.round((parseInt(parts[idx + 1], 16) / 255) * 100);
    }
    return null;
  } catch {
    return null;
  }
}

export async function readOdometer(deviceId: string): Promise<number | null> {
  try {
    // Mode 01 PID A6 — Odometer (km)
    const raw = await sendCommand(deviceId, '01A6');
    const parts = raw.replace(/[\r\n>]/g, ' ').trim().split(/\s+/);
    const idx = parts.findIndex((p) => p.toUpperCase() === 'A6');
    if (idx >= 0 && parts.slice(idx + 1, idx + 5).length === 4) {
      const bytes = parts.slice(idx + 1, idx + 5).map((b) => parseInt(b, 16));
      return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) * 0.1;
    }
    return null;
  } catch {
    return null;
  }
}

export async function isEngineRunning(deviceId: string): Promise<boolean> {
  try {
    // Mode 01 PID 0C — RPM
    const raw = await sendCommand(deviceId, '010C');
    const parts = raw.replace(/[\r\n>]/g, ' ').trim().split(/\s+/);
    const idx = parts.findIndex((p) => p.toUpperCase() === '0C');
    if (idx >= 0 && parts[idx + 1] && parts[idx + 2]) {
      const rpm = ((parseInt(parts[idx + 1], 16) * 256) + parseInt(parts[idx + 2], 16)) / 4;
      return rpm > 0;
    }
    return false;
  } catch {
    return false;
  }
}

export function getConnectedDevice(): BleDevice | null {
  return connectedDevice;
}

export async function disconnect(): Promise<void> {
  if (connectedDevice) {
    await BleClient.disconnect(connectedDevice.deviceId);
    connectedDevice = null;
  }
}
