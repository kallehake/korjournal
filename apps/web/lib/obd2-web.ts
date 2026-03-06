/**
 * Web Bluetooth OBD2 service for use in Chrome on Android/Desktop.
 * Uses the ELM327 protocol over BLE (same as the mobile adapter).
 * Requires HTTPS and a user gesture to initiate connection.
 */

// Module-level connection state
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _device: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _char: any = null;
let _buffer = '';
let _resolver: ((v: string) => void) | null = null;
let _rejecter: ((e: Error) => void) | null = null;

const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const CHAR_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

function onNotification(event: Event) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const char = event.target as any;
  if (!char.value) return;
  _buffer += new TextDecoder().decode(char.value);

  if (_buffer.includes('>') && _resolver) {
    const response = _buffer.replace(/>/g, '').replace(/\r/g, ' ').trim();
    _buffer = '';
    const resolve = _resolver;
    _resolver = null;
    _rejecter = null;
    resolve(response);
  }
}

async function sendCommand(cmd: string, timeoutMs = 4000): Promise<string> {
  if (!_char) throw new Error('Inte ansluten till OBD2-adapter');
  _buffer = '';

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _resolver = null;
      _rejecter = null;
      reject(new Error('OBD2 timeout — inget svar från adaptern'));
    }, timeoutMs);

    _resolver = (v) => { clearTimeout(timer); resolve(v); };
    _rejecter = (e) => { clearTimeout(timer); reject(e); };

    const data = new TextEncoder().encode(cmd + '\r');
    _char!.writeValue(data).catch((e: Error) => {
      clearTimeout(timer);
      _resolver = null;
      _rejecter = null;
      reject(e);
    });
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function isSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function isConnected(): boolean {
  return _device?.gatt?.connected === true;
}

/**
 * Opens the browser's Bluetooth device picker and connects to the adapter.
 * Must be called from a user gesture (button click).
 */
export async function connect(): Promise<void> {
  if (!isSupported()) {
    throw new Error(
      'Web Bluetooth stöds inte. Använd Chrome på Android eller Chrome på datorn.',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _device = await (navigator as any).bluetooth.requestDevice({
    filters: [
      { namePrefix: 'iCar' },
      { namePrefix: 'Vgate' },
      { namePrefix: 'OBD' },
      { namePrefix: 'ELM' },
    ],
    optionalServices: [SERVICE_UUID],
  });

  const server = await _device.gatt!.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  _char = await service.getCharacteristic(CHAR_UUID);

  await _char.startNotifications();
  _char.addEventListener('characteristicvaluechanged', onNotification);

  // Initialise ELM327
  await sendCommand('ATZ', 5000); // Reset — may take up to 2s
  await sendCommand('ATE0');      // Echo off
  await sendCommand('ATL0');      // Linefeeds off
  await sendCommand('ATS0');      // Spaces off
  await sendCommand('ATSP0');     // Auto-detect protocol
}

/**
 * Reads the vehicle odometer via standard OBD2 PID 0xA6.
 * Returns km as integer, or null if the vehicle doesn't support this PID.
 */
export async function readOdometer(): Promise<number | null> {
  const response = await sendCommand('01A6');
  const clean = response.replace(/\s/g, '').toUpperCase();
  const match = clean.match(/41A6([0-9A-F]{8})/);
  if (!match) return null;
  return Math.round(parseInt(match[1], 16) * 0.1);
}

export function disconnect(): void {
  _char?.removeEventListener('characteristicvaluechanged', onNotification);
  _device?.gatt?.disconnect();
  _device = null;
  _char = null;
  _buffer = '';
  _resolver = null;
  _rejecter = null;
}
