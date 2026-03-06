'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import * as Obd2 from '@/lib/obd2-web';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'active' | 'completing';

interface ActiveTrip {
  id: string;
  vehicleId: string;
  startTime: string;
  odometerStart: number;
  startAddress: string;
  tripType: 'business' | 'private';
}

const STORAGE_KEY = 'korjournal_active_trip';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=sv`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Korjournal/1.0' } });
    const data = await res.json();
    const parts: string[] = [];
    if (data.address?.road) {
      parts.push(
        data.address.house_number
          ? `${data.address.road} ${data.address.house_number}`
          : data.address.road,
      );
    }
    const city = data.address?.city ?? data.address?.town ?? data.address?.village;
    if (city) parts.push(city);
    return parts.join(', ') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Plats ej tillgänglig i webbläsaren'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 60000,
    });
  });
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DrivePage() {
  const supabase = createSupabaseBrowserClient();

  // Phase
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start form
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [tripType, setTripType] = useState<'business' | 'private'>('business');
  const [odometerStart, setOdometerStart] = useState('');
  const [startAddress, setStartAddress] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [obd2Status, setObd2Status] = useState<'idle' | 'connecting' | 'reading' | 'error'>('idle');
  const [obd2Error, setObd2Error] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Completion form
  const [endAddress, setEndAddress] = useState('');
  const [odometerEnd, setOdometerEnd] = useState('');
  const [purpose, setPurpose] = useState('');
  const [visitedPerson, setVisitedPerson] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [obd2EndStatus, setObd2EndStatus] = useState<'idle' | 'connecting' | 'reading' | 'error'>('idle');
  const [obd2EndError, setObd2EndError] = useState<string | null>(null);

  // Data
  const { data: vehicles } = useQuery({
    queryKey: ['vehicles-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('vehicles')
        .select('id, registration_number, make, model, current_odometer')
        .eq('is_active', true)
        .order('registration_number');
      return data ?? [];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      return data ?? [];
    },
  });

  // ─── Restore active trip from localStorage ────────────────────────────────

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const trip: ActiveTrip = JSON.parse(raw);
      // Verify it's still active in Supabase
      supabase
        .from('trips')
        .select('id, status')
        .eq('id', trip.id)
        .single()
        .then(({ data }) => {
          if (data?.status === 'active') {
            setActiveTrip(trip);
            setPhase('active');
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // ─── Timer ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'active' && activeTrip) {
      const startMs = new Date(activeTrip.startTime).getTime();
      const tick = () => setElapsed(Math.floor((Date.now() - startMs) / 1000));
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, activeTrip]);

  // Pre-fill odometer from vehicle when selection changes
  useEffect(() => {
    if (selectedVehicleId && vehicles) {
      const v = vehicles.find((v) => v.id === selectedVehicleId);
      if (v?.current_odometer) setOdometerStart(v.current_odometer.toString());
    }
  }, [selectedVehicleId, vehicles]);

  // ─── GPS ─────────────────────────────────────────────────────────────────

  const fetchGpsAddress = useCallback(async (setter: (addr: string) => void) => {
    setGpsLoading(true);
    try {
      const pos = await getCurrentPosition();
      const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      setter(addr);
    } catch {
      // Let user fill in manually
    } finally {
      setGpsLoading(false);
    }
  }, []);

  // ─── OBD2 ────────────────────────────────────────────────────────────────

  const readObd2Odometer = useCallback(async (
    setStatus: (s: 'idle' | 'connecting' | 'reading' | 'error') => void,
    setError: (e: string | null) => void,
    setOdometer: (v: string) => void,
  ) => {
    setError(null);
    setStatus('connecting');
    try {
      if (!Obd2.isConnected()) await Obd2.connect();
      setStatus('reading');
      const value = await Obd2.readOdometer();
      if (value !== null) {
        setOdometer(value.toString());
      } else {
        setError('Bilen stöder inte automatisk mätarläsning via OBD2. Fyll i manuellt.');
      }
      setStatus('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OBD2-fel');
      setStatus('error');
    }
  }, []);

  // ─── Start trip ───────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    if (!selectedVehicleId || !odometerStart) return;
    setStartError(null);
    setStarting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Inte inloggad');

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, organization_id')
        .eq('id', user.id)
        .single();
      if (!profile) throw new Error('Profil saknas');

      const now = new Date().toISOString();
      const { data: trip, error } = await supabase
        .from('trips')
        .insert({
          vehicle_id: selectedVehicleId,
          driver_id: profile.id,
          organization_id: profile.organization_id,
          date: now.split('T')[0],
          start_time: now,
          start_address: startAddress || 'Okänd adress',
          odometer_start: parseInt(odometerStart, 10),
          trip_type: tripType,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      const activeTripData: ActiveTrip = {
        id: trip.id,
        vehicleId: selectedVehicleId,
        startTime: now,
        odometerStart: parseInt(odometerStart, 10),
        startAddress: startAddress || 'Okänd adress',
        tripType,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeTripData));
      setActiveTrip(activeTripData);
      setPhase('active');
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Kunde inte starta resa');
    } finally {
      setStarting(false);
    }
  }, [selectedVehicleId, odometerStart, startAddress, tripType, supabase]);

  // ─── Stop trip (show completion form) ────────────────────────────────────

  const handleStop = useCallback(async () => {
    setPhase('completing');
    fetchGpsAddress(setEndAddress);
  }, [fetchGpsAddress]);

  // ─── Complete trip ────────────────────────────────────────────────────────

  const handleComplete = useCallback(async () => {
    if (!activeTrip || !odometerEnd) return;
    setCompleteError(null);
    setCompleting(true);

    try {
      const { error } = await supabase
        .from('trips')
        .update({
          end_time: new Date().toISOString(),
          end_address: endAddress || 'Okänd adress',
          odometer_end: parseInt(odometerEnd, 10),
          purpose: purpose || null,
          visited_person: visitedPerson || null,
          customer_id: selectedCustomerId || null,
          notes: notes || null,
          status: 'completed',
        })
        .eq('id', activeTrip.id);

      if (error) throw error;

      // Update vehicle odometer
      await supabase
        .from('vehicles')
        .update({ current_odometer: parseInt(odometerEnd, 10) })
        .eq('id', activeTrip.vehicleId);

      localStorage.removeItem(STORAGE_KEY);
      setActiveTrip(null);
      setPhase('idle');

      // Reset form
      setOdometerStart('');
      setStartAddress('');
      setEndAddress('');
      setOdometerEnd('');
      setPurpose('');
      setVisitedPerson('');
      setSelectedCustomerId('');
      setNotes('');
    } catch (e) {
      setCompleteError(e instanceof Error ? e.message : 'Kunde inte spara resa');
    } finally {
      setCompleting(false);
    }
  }, [activeTrip, odometerEnd, endAddress, purpose, visitedPerson, selectedCustomerId, notes, supabase]);

  // ─── Render ───────────────────────────────────────────────────────────────

  // ── Active trip ──
  if (phase === 'active' && activeTrip) {
    const vehicle = vehicles?.find((v) => v.id === activeTrip.vehicleId);
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Resa pågår</h1>

        <div className="rounded-2xl bg-green-50 border border-green-200 p-6 text-center">
          <p className="text-sm font-medium text-green-700 mb-2">Körtid</p>
          <p className="text-5xl font-bold text-green-800 tabular-nums">{formatElapsed(elapsed)}</p>
          <div className="mt-4 space-y-1 text-sm text-green-700">
            <p>{vehicle?.registration_number ?? ''} {vehicle?.make ?? ''}</p>
            <p>Startade: {activeTrip.startAddress}</p>
            <p>Mätare start: {activeTrip.odometerStart.toLocaleString('sv-SE')} km</p>
          </div>
        </div>

        <button
          onClick={handleStop}
          className="w-full py-5 rounded-2xl bg-red-600 text-white text-xl font-bold hover:bg-red-700 active:bg-red-800"
        >
          Avsluta resa
        </button>
      </div>
    );
  }

  // ── Completion form ──
  if (phase === 'completing') {
    const obd2Busy = obd2EndStatus === 'connecting' || obd2EndStatus === 'reading';
    const obd2Label = obd2EndStatus === 'connecting' ? 'Ansluter...' : obd2EndStatus === 'reading' ? 'Läser...' : 'Läs från OBD2';

    return (
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Avsluta resa</h1>
        <p className="text-sm text-gray-500">Fyll i uppgifter enligt Skatteverkets krav</p>

        {completeError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {completeError}
          </div>
        )}

        {/* Trip type */}
        <div className={`rounded-xl border-2 py-3 text-center text-sm font-semibold ${
          activeTrip?.tripType === 'business'
            ? 'border-blue-600 bg-blue-50 text-blue-700'
            : 'border-purple-600 bg-purple-50 text-purple-700'
        }`}>
          {activeTrip?.tripType === 'business' ? 'Tjänsteresa' : 'Privatresa'}
        </div>

        {/* End address */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Slutadress</label>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm bg-white"
              value={endAddress}
              onChange={(e) => setEndAddress(e.target.value)}
              placeholder={gpsLoading ? 'Hämtar adress...' : 'Slutadress'}
            />
          </div>
        </div>

        {/* Odometer end */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Mätarställning slut (km) *
          </label>
          <input
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm bg-white"
            value={odometerEnd}
            onChange={(e) => setOdometerEnd(e.target.value)}
            type="number"
            inputMode="numeric"
            placeholder="T.ex. 45 230"
          />
          <div className="flex items-center justify-between mt-2">
            {obd2EndError && <p className="text-xs text-red-600 flex-1">{obd2EndError}</p>}
            {obd2EndStatus !== 'idle' && obd2EndStatus !== 'error' && (
              <p className="text-xs text-blue-600 flex-1">{obd2Label}</p>
            )}
            <button
              onClick={() => readObd2Odometer(setObd2EndStatus, setObd2EndError, setOdometerEnd)}
              disabled={obd2Busy}
              className="ml-auto text-sm font-semibold text-blue-600 border border-blue-300 rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              {obd2Busy ? '...' : 'Läs från OBD2'}
            </button>
          </div>
        </div>

        {/* Purpose */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Ändamål / syfte</label>
          <input
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm bg-white"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="T.ex. Kundmöte, leverans"
          />
        </div>

        {/* Visited person */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Besökt person / företag</label>
          <input
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm bg-white"
            value={visitedPerson}
            onChange={(e) => setVisitedPerson(e.target.value)}
            placeholder="T.ex. Anna Svensson, AB Företag"
          />
        </div>

        {/* Customer */}
        {customers && customers.length > 0 && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Kund</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCustomerId('')}
                className={`rounded-full px-4 py-2 text-sm font-medium border ${
                  !selectedCustomerId
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                Ingen
              </button>
              {customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCustomerId(c.id)}
                  className={`rounded-full px-4 py-2 text-sm font-medium border ${
                    selectedCustomerId === c.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Anteckningar</label>
          <textarea
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm bg-white resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Valfritt..."
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pb-8">
          <button
            onClick={() => setPhase('active')}
            className="flex-1 py-4 rounded-xl border border-gray-300 text-gray-700 font-semibold"
          >
            Fortsätt resa
          </button>
          <button
            onClick={handleComplete}
            disabled={completing || !odometerEnd}
            className="flex-1 py-4 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50 hover:bg-blue-700"
          >
            {completing ? 'Sparar...' : 'Spara resa'}
          </button>
        </div>
      </div>
    );
  }

  // ── Start form (idle) ──
  const obd2Busy = obd2Status === 'connecting' || obd2Status === 'reading';
  const obd2Label =
    obd2Status === 'connecting' ? 'Ansluter...' :
    obd2Status === 'reading' ? 'Läser...' : 'Läs från OBD2';

  const canStart = selectedVehicleId && odometerStart;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Starta resa</h1>

      {startError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {startError}
        </div>
      )}

      {/* Trip type */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Typ av resa</label>
        <div className="flex gap-2">
          <button
            onClick={() => setTripType('business')}
            className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
              tripType === 'business'
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-500'
            }`}
          >
            Tjänsteresa
          </button>
          <button
            onClick={() => setTripType('private')}
            className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
              tripType === 'private'
                ? 'border-purple-600 bg-purple-50 text-purple-700'
                : 'border-gray-200 text-gray-500'
            }`}
          >
            Privatresa
          </button>
        </div>
      </div>

      {/* Vehicle */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Fordon *</label>
        <div className="flex flex-wrap gap-2">
          {vehicles?.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedVehicleId(v.id)}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                selectedVehicleId === v.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <p className={`font-bold text-sm ${selectedVehicleId === v.id ? 'text-blue-700' : 'text-gray-800'}`}>
                {v.registration_number}
              </p>
              {v.make && (
                <p className="text-xs text-gray-500 mt-0.5">{v.make} {v.model ?? ''}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Start address */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Startadress</label>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm bg-white"
            value={startAddress}
            onChange={(e) => setStartAddress(e.target.value)}
            placeholder={gpsLoading ? 'Hämtar position...' : 'Adress (auto via GPS)'}
          />
          <button
            onClick={() => fetchGpsAddress(setStartAddress)}
            disabled={gpsLoading}
            className="px-3 py-3 rounded-xl border border-gray-300 text-gray-600 text-sm disabled:opacity-50"
            title="Hämta via GPS"
          >
            {gpsLoading ? '⏳' : '📍'}
          </button>
        </div>
      </div>

      {/* Odometer start */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Mätarställning start (km) *
        </label>
        <input
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm bg-white"
          value={odometerStart}
          onChange={(e) => setOdometerStart(e.target.value)}
          type="number"
          inputMode="numeric"
          placeholder="T.ex. 45 200"
        />
        <div className="flex items-center justify-between mt-2">
          {obd2Error && <p className="text-xs text-red-600 flex-1">{obd2Error}</p>}
          {obd2Status !== 'idle' && obd2Status !== 'error' && (
            <p className="text-xs text-blue-600 flex-1">{obd2Label}</p>
          )}
          <button
            onClick={() => readObd2Odometer(setObd2Status, setObd2Error, setOdometerStart)}
            disabled={obd2Busy}
            className="ml-auto text-sm font-semibold text-blue-600 border border-blue-300 rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            {obd2Busy ? '...' : 'Läs från OBD2'}
          </button>
        </div>
        {!Obd2.isSupported() && (
          <p className="text-xs text-amber-600 mt-1">
            OBD2-läsning kräver Chrome. Fyll i mätarställning manuellt.
          </p>
        )}
      </div>

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={!canStart || starting}
        className="w-full py-5 rounded-2xl bg-green-600 text-white text-xl font-bold hover:bg-green-700 active:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {starting ? 'Startar...' : 'Starta resa'}
      </button>

      {/* Info */}
      <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Skatteverkets krav</p>
        <p>Fordon, mätarställning (start + slut), adresser och ändamål för tjänsteresor är obligatoriska.</p>
      </div>
    </div>
  );
}
