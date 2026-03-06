// Lazy-load BLE to avoid crash if native module isn't ready
// @ts-ignore
let BleManagerClass: any = null;
function getBleManagerClass() {
  if (!BleManagerClass) {
    const blePlx = require('react-native-ble-plx');
    BleManagerClass = blePlx.BleManager;
  }
  return BleManagerClass;
}
type Device = any;
type Characteristic = any;

// ELM327 BLE service/characteristic UUIDs (common across most adapters)
const ELM327_SERVICE_UUID = 'fff0';
const ELM327_NOTIFY_CHAR_UUID = 'fff1';
const ELM327_WRITE_CHAR_UUID = 'fff2';

// Alternative UUIDs used by some adapters (e.g. Vgate iCar Pro)
const ALT_SERVICE_UUIDS = [
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
];

// Known OBD2 adapter name prefixes
const OBD2_NAME_PREFIXES = [
  'OBDII', 'OBD', 'ELM', 'Vgate', 'iCar', 'V-LINK',
  'KONNWEI', 'Veepeak', 'BAFX', 'Carista', 'LELink',
];

type ConnectionCallback = (connected: boolean, device: Device | null) => void;

let bleManager: BleManager | null = null;
let connectedDevice: Device | null = null;
let writeCharacteristic: Characteristic | null = null;
let notifyCharacteristic: Characteristic | null = null;
let responseBuffer = '';
let connectionCallback: ConnectionCallback | null = null;

function getManager(): any {
  if (!bleManager) {
    const BM = getBleManagerClass();
    bleManager = new BM();
  }
  return bleManager;
}

function isObd2Device(device: Device): boolean {
  const name = device.name || device.localName || '';
  return OBD2_NAME_PREFIXES.some((prefix) =>
    name.toUpperCase().includes(prefix.toUpperCase()),
  );
}

export async function scanForAdapters(
  onDeviceFound: (device: Device) => void,
  timeoutMs = 10000,
): Promise<void> {
  const manager = getManager();

  // Check BLE state
  const state = await manager.state();
  if (state !== 'PoweredOn') {
    throw new Error('Bluetooth är inte aktiverat. Slå på Bluetooth i inställningarna.');
  }

  return new Promise((resolve) => {
    const seenIds = new Set<string>();

    manager.startDeviceScan(null, { allowDuplicates: false }, (error: any, device: any) => {
      if (error) {
        console.error('BLE scan error:', error);
        return;
      }
      if (!device || seenIds.has(device.id)) return;
      if (!isObd2Device(device)) return;

      seenIds.add(device.id);
      onDeviceFound(device);
    });

    setTimeout(() => {
      manager.stopDeviceScan();
      resolve();
    }, timeoutMs);
  });
}

export function stopScanning(): void {
  getManager().stopDeviceScan();
}

/**
 * Scans for OBD2 adapters and automatically connects to the first one found.
 * Resolves immediately when connected — does not wait for the full timeout.
 */
export async function connectToFirstDevice(timeoutMs = 15_000): Promise<Device> {
  const manager = getManager();

  const state = await manager.state();
  if (state !== 'PoweredOn') {
    throw new Error('Bluetooth är inte aktiverat. Slå på Bluetooth i inställningarna.');
  }

  return new Promise((resolve, reject) => {
    let connecting = false;

    const timer = setTimeout(() => {
      manager.stopDeviceScan();
      reject(
        new Error(
          'Hittade ingen OBD2-adapter. Kontrollera att adaptern är inkopplad i bilen och att Bluetooth är aktivt.',
        ),
      );
    }, timeoutMs);

    manager.startDeviceScan(null, { allowDuplicates: false }, async (error: any, device: any) => {
      if (connecting) return;
      if (error) {
        clearTimeout(timer);
        manager.stopDeviceScan();
        reject(error);
        return;
      }
      if (!device || !isObd2Device(device)) return;

      connecting = true;
      manager.stopDeviceScan();
      clearTimeout(timer);

      try {
        const connected = await connect(device.id);
        resolve(connected);
      } catch (e) {
        reject(e);
      }
    });
  });
}

export async function connect(deviceId: string): Promise<Device> {
  const manager = getManager();

  // Connect to device
  const device = await manager.connectToDevice(deviceId, {
    requestMTU: 512,
    timeout: 10000,
  });

  await device.discoverAllServicesAndCharacteristics();

  // Find the right service and characteristics
  const services = await device.services();
  let serviceUUID: string | null = null;

  for (const service of services) {
    const uuid = service.uuid.toLowerCase();
    if (
      uuid.includes(ELM327_SERVICE_UUID) ||
      ALT_SERVICE_UUIDS.some((alt) => uuid.includes(alt.toLowerCase()))
    ) {
      serviceUUID = service.uuid;
      break;
    }
  }

  if (!serviceUUID) {
    throw new Error('Kunde inte hitta OBD2-service på enheten.');
  }

  const characteristics = await device.characteristicsForService(serviceUUID);

  for (const char of characteristics) {
    const uuid = char.uuid.toLowerCase();
    if (uuid.includes(ELM327_WRITE_CHAR_UUID) || char.isWritableWithResponse || char.isWritableWithoutResponse) {
      writeCharacteristic = char;
    }
    if (uuid.includes(ELM327_NOTIFY_CHAR_UUID) || char.isNotifiable) {
      notifyCharacteristic = char;
    }
  }

  if (!writeCharacteristic || !notifyCharacteristic) {
    // Fallback: use the first available characteristics
    for (const char of characteristics) {
      if (!writeCharacteristic && (char.isWritableWithResponse || char.isWritableWithoutResponse)) {
        writeCharacteristic = char;
      }
      if (!notifyCharacteristic && char.isNotifiable) {
        notifyCharacteristic = char;
      }
    }
  }

  if (!writeCharacteristic || !notifyCharacteristic) {
    throw new Error('Kunde inte hitta skriv/notifikations-karaktäristik.');
  }

  // Set up notification listener
  notifyCharacteristic.monitor((error: any, char: any) => {
    if (error) return;
    if (char?.value) {
      const decoded = atob(char.value);
      responseBuffer += decoded;
    }
  });

  connectedDevice = device;

  // Monitor disconnection
  manager.onDeviceDisconnected(deviceId, (error: any, _dev: any) => {
    connectedDevice = null;
    writeCharacteristic = null;
    notifyCharacteristic = null;
    connectionCallback?.(false, null);
  });

  // Initialize ELM327
  await initializeElm327();

  connectionCallback?.(true, device);
  return device;
}

export async function disconnect(): Promise<void> {
  if (connectedDevice) {
    try {
      await getManager().cancelDeviceConnection(connectedDevice.id);
    } catch {
      // Already disconnected
    }
    connectedDevice = null;
    writeCharacteristic = null;
    notifyCharacteristic = null;
  }
}

export function onConnectionStateChange(callback: ConnectionCallback): void {
  connectionCallback = callback;
}

export function isConnected(): boolean {
  return connectedDevice !== null;
}

export function getConnectedDevice(): Device | null {
  return connectedDevice;
}

// --- ELM327 Protocol ---

async function sendCommand(command: string, timeoutMs = 3000): Promise<string> {
  if (!writeCharacteristic) {
    throw new Error('Inte ansluten till OBD2-adapter.');
  }

  responseBuffer = '';

  // Send command with carriage return
  const data = btoa(command + '\r');
  await writeCharacteristic.writeWithResponse(data);

  // Wait for response (ELM327 terminates with '>')
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (responseBuffer.includes('>')) {
        clearInterval(interval);
        const response = responseBuffer
          .replace(/>/g, '')
          .replace(/\r/g, '')
          .replace(/\n/g, ' ')
          .trim();
        resolve(response);
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        reject(new Error('OBD2-kommandot tog för lång tid.'));
      }
    }, 50);
  });
}

async function initializeElm327(): Promise<void> {
  await sendCommand('ATZ', 5000);  // Reset
  await sendCommand('ATE0');       // Echo off
  await sendCommand('ATL0');       // Linefeeds off
  await sendCommand('ATS0');       // Spaces off
  await sendCommand('ATH0');       // Headers off
  await sendCommand('ATSP0');      // Auto-detect protocol
}

function parseHexBytes(response: string): number[] {
  // Remove any non-hex characters and split into byte pairs
  const clean = response.replace(/[^0-9A-Fa-f]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.substring(i, i + 2), 16));
  }
  return bytes;
}

/**
 * Read vehicle speed via PID 01 0D
 * Returns speed in km/h
 */
export async function readSpeed(): Promise<number> {
  const response = await sendCommand('010D');
  if (response.includes('NO DATA') || response.includes('ERROR')) {
    throw new Error('Kunde inte läsa hastighet.');
  }
  const bytes = parseHexBytes(response);
  // Response: 41 0D XX — where XX is speed in km/h
  const dataIndex = bytes.indexOf(0x41);
  if (dataIndex >= 0 && bytes.length > dataIndex + 2) {
    return bytes[dataIndex + 2];
  }
  throw new Error('Ogiltigt hastighets-svar.');
}

/**
 * Read engine RPM via PID 01 0C
 * Returns RPM
 */
export async function readRPM(): Promise<number> {
  const response = await sendCommand('010C');
  if (response.includes('NO DATA') || response.includes('ERROR')) {
    throw new Error('Kunde inte läsa RPM.');
  }
  const bytes = parseHexBytes(response);
  // Response: 41 0C XX YY — RPM = ((A*256)+B)/4
  const dataIndex = bytes.indexOf(0x41);
  if (dataIndex >= 0 && bytes.length > dataIndex + 3) {
    const a = bytes[dataIndex + 2];
    const b = bytes[dataIndex + 3];
    return Math.round(((a * 256) + b) / 4);
  }
  throw new Error('Ogiltigt RPM-svar.');
}

/**
 * Read odometer via PID 01 A6
 * Returns odometer in km
 * Note: Not all vehicles support this PID
 */
export async function readOdometer(): Promise<number> {
  const response = await sendCommand('01A6');
  if (response.includes('NO DATA') || response.includes('ERROR')) {
    throw new Error('Mätarställning stöds inte av detta fordon via OBD2.');
  }
  const bytes = parseHexBytes(response);
  // Response: 41 A6 AA BB CC DD — odometer in km = ((A*2^24)+(B*2^16)+(C*2^8)+D)/10
  const dataIndex = bytes.indexOf(0x41);
  if (dataIndex >= 0 && bytes.length > dataIndex + 5) {
    const a = bytes[dataIndex + 2];
    const b = bytes[dataIndex + 3];
    const c = bytes[dataIndex + 4];
    const d = bytes[dataIndex + 5];
    return Math.round((a * 16777216 + b * 65536 + c * 256 + d) / 10);
  }
  throw new Error('Ogiltigt mätarställnings-svar.');
}

/**
 * Read battery voltage via ELM327 AT command
 * Returns voltage as a number (e.g. 12.4)
 */
export async function readBatteryVoltage(): Promise<number> {
  const response = await sendCommand('ATRV');
  // Response is like "12.4V" or "12.4"
  const match = response.match(/(\d+\.?\d*)/);
  if (match) {
    return parseFloat(match[1]);
  }
  throw new Error('Kunde inte läsa batterispänning.');
}

/**
 * Read coolant temperature via PID 01 05
 * Returns temperature in Celsius
 */
export async function readCoolantTemp(): Promise<number> {
  const response = await sendCommand('0105');
  if (response.includes('NO DATA') || response.includes('ERROR')) {
    throw new Error('Kunde inte läsa kylvätsketemperatur.');
  }
  const bytes = parseHexBytes(response);
  const dataIndex = bytes.indexOf(0x41);
  if (dataIndex >= 0 && bytes.length > dataIndex + 2) {
    return bytes[dataIndex + 2] - 40; // Offset by -40
  }
  throw new Error('Ogiltigt temperatur-svar.');
}

/**
 * Check which PIDs are supported
 */
export async function getSupportedPids(): Promise<string> {
  return sendCommand('0100');
}
