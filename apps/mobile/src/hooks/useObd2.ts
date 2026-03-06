import { useState, useCallback } from 'react';
import {
  connectToFirstDevice,
  readOdometer as obd2ReadOdometer,
  disconnect,
} from '../services/obd2';

export type Obd2Status = 'idle' | 'scanning' | 'connecting' | 'reading' | 'error';

export const OBD2_STATUS_LABEL: Record<Obd2Status, string> = {
  idle: '',
  scanning: 'Söker adapter...',
  connecting: 'Ansluter...',
  reading: 'Läser mätarställning...',
  error: '',
};

interface UseObd2Result {
  status: Obd2Status;
  error: string | null;
  isBusy: boolean;
  readOdometer: () => Promise<number | null>;
  reset: () => void;
}

export function useObd2(): UseObd2Result {
  const [status, setStatus] = useState<Obd2Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const readOdometer = useCallback(async (): Promise<number | null> => {
    setError(null);
    setStatus('scanning');

    try {
      await connectToFirstDevice(15_000);

      setStatus('reading');
      const value = await obd2ReadOdometer();

      await disconnect();
      setStatus('idle');
      return value;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OBD2-fel';
      setError(message);
      setStatus('error');
      try {
        await disconnect();
      } catch {
        // ignore
      }
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return {
    status,
    error,
    isBusy: status === 'scanning' || status === 'connecting' || status === 'reading',
    readOdometer,
    reset,
  };
}
