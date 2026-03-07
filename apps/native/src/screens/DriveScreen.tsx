import { useState, useEffect, useRef, useCallback } from 'react';
import * as Obd2 from '../services/obd2';
import { getCurrentPosition, reverseGeocode, calcRouteKm } from '../services/gps';
import { supabase } from '../services/supabase';

type Phase = 'idle' | 'scanning' | 'ready' | 'active' | 'completing';

interface TripData {
  id: string;
  odometerStart: number;
  startAddress: string;
  startLat: number;
  startLng: number;
  startTime: string;
  vehicleId: string;
  tripType: 'business' | 'private';
}

const TRIP_KEY = 'korjournal_native_trip';

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function DriveScreen() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [bleStatus, setBleStatus] = useState('');
  const [soc, setSoc] = useState<number | null>(null);
  const [odometer, setOdometer] = useState<number | null>(null);
  const [startAddress, setStartAddress] = useState('');
  const [tripType, setTripType] = useState<'business' | 'private'>('business');
  const [trip, setTrip] = useState<TripData | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [endAddress, setEndAddress] = useState('');
  const [odometerEnd, setOdometerEnd] = useState<number | null>(null);
  const [purpose, setPurpose] = useState('');
  const [calcRoute, setCalcRoute] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<{ id: string; registration_number: string }[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load vehicles and restore trip
  useEffect(() => {
    supabase.from('vehicles').select('id, registration_number').eq('is_active', true)
      .then(({ data }) => {
        if (data?.length) {
          setVehicles(data);
          setSelectedVehicle(data[0].id);
        }
      });

    const saved = localStorage.getItem(TRIP_KEY);
    if (saved) {
      try {
        const t: TripData = JSON.parse(saved);
        setTrip(t);
        setPhase('active');
      } catch {
        localStorage.removeItem(TRIP_KEY);
      }
    }
  }, []);

  // Timer
  useEffect(() => {
    if (phase === 'active' && trip) {
      const start = new Date(trip.startTime).getTime();
      const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, trip]);

  const handleScan = useCallback(async () => {
    setPhase('scanning');
    setError(null);
    try {
      await Obd2.initialize();
      const device = await Obd2.scanAndConnect(setBleStatus);
      if (!device) {
        setPhase('idle');
        return;
      }

      // Read SOC and odometer
      const [socVal, odomVal] = await Promise.all([
        Obd2.readSoc(device.deviceId),
        Obd2.readOdometer(device.deviceId),
      ]);
      setSoc(socVal);
      setOdometer(odomVal);

      // Get GPS address
      const pos = await getCurrentPosition();
      if (pos) {
        const addr = await reverseGeocode(pos.lat, pos.lng);
        setStartAddress(addr);
      }

      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fel vid anslutning');
      setPhase('idle');
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (!selectedVehicle || !odometer) return;
    setError(null);

    const pos = await getCurrentPosition();
    if (!pos) {
      setError('GPS ej tillgänglig');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Inte inloggad'); return; }

    const { data: profile } = await supabase.from('profiles')
      .select('id, organization_id').eq('id', user.id).single();
    if (!profile) { setError('Profil saknas'); return; }

    const now = new Date().toISOString();
    const { data: tripRow, error: tripErr } = await supabase.from('trips').insert({
      vehicle_id: selectedVehicle,
      driver_id: profile.id,
      organization_id: profile.organization_id,
      date: now.split('T')[0],
      start_time: now,
      start_address: startAddress || 'Okänd adress',
      odometer_start: Math.round(odometer),
      trip_type: tripType,
      status: 'active',
    }).select().single();

    if (tripErr) { setError(tripErr.message); return; }

    const tripData: TripData = {
      id: tripRow.id,
      odometerStart: Math.round(odometer),
      startAddress: startAddress || 'Okänd adress',
      startLat: pos.lat,
      startLng: pos.lng,
      startTime: now,
      vehicleId: selectedVehicle,
      tripType,
    };

    localStorage.setItem(TRIP_KEY, JSON.stringify(tripData));
    setTrip(tripData);
    setPhase('active');
  }, [selectedVehicle, odometer, startAddress, tripType]);

  const handleStop = useCallback(async () => {
    if (!trip) return;
    setPhase('completing');
    setCalcRoute(true);

    const pos = await getCurrentPosition();
    if (pos) {
      reverseGeocode(pos.lat, pos.lng).then(setEndAddress);
      calcRouteKm(trip.startLat, trip.startLng, pos.lat, pos.lng).then((km) => {
        if (km) setOdometerEnd(trip.odometerStart + km);
        setCalcRoute(false);
      });
    } else {
      setCalcRoute(false);
    }

    // Try to read odometer from OBD2 if still connected
    const device = Obd2.getConnectedDevice();
    if (device) {
      Obd2.readOdometer(device.deviceId).then((val) => {
        if (val) setOdometerEnd(Math.round(val));
      });
    }
  }, [trip]);

  const handleSave = useCallback(async () => {
    if (!trip || !odometerEnd) return;
    setSaving(true);
    setError(null);

    const { error: saveErr } = await supabase.from('trips').update({
      end_time: new Date().toISOString(),
      end_address: endAddress || 'Okänd adress',
      odometer_end: odometerEnd,
      trip_type: tripType,
      purpose: purpose || null,
      status: 'completed',
    }).eq('id', trip.id);

    if (saveErr) {
      setError(saveErr.message);
      setSaving(false);
      return;
    }

    await supabase.from('vehicles')
      .update({ current_odometer: odometerEnd })
      .eq('id', trip.vehicleId);

    localStorage.removeItem(TRIP_KEY);
    setTrip(null);
    setPhase('idle');
    setSoc(null);
    setOdometer(null);
    setStartAddress('');
    setEndAddress('');
    setOdometerEnd(null);
    setPurpose('');
    setSaving(false);
    await Obd2.disconnect();
  }, [trip, odometerEnd, endAddress, tripType, purpose]);

  // ── RENDER ────────────────────────────────────────────────────────────────

  if (phase === 'active' && trip) {
    return (
      <div className="screen">
        <div className="card green">
          <p className="label">Resa pågår</p>
          <p className="timer">{formatTime(elapsed)}</p>
          <p className="sub">{trip.startAddress}</p>
          <p className="sub">Mätare: {trip.odometerStart.toLocaleString('sv-SE')} km</p>
          <p className="badge">{trip.tripType === 'business' ? 'Tjänsteresa' : 'Privatresa'}</p>
        </div>
        <button className="btn red" onClick={handleStop}>Avsluta resa</button>
      </div>
    );
  }

  if (phase === 'completing') {
    return (
      <div className="screen">
        <h1>Avsluta resa</h1>
        {error && <p className="error">{error}</p>}

        <div className="field">
          <label>Restyp</label>
          <div className="row">
            <button className={`toggle ${tripType === 'business' ? 'active-blue' : ''}`}
              onClick={() => setTripType('business')}>Tjänsteresa</button>
            <button className={`toggle ${tripType === 'private' ? 'active-purple' : ''}`}
              onClick={() => setTripType('private')}>Privatresa</button>
          </div>
        </div>

        <div className="field">
          <label>Slutadress</label>
          <input value={endAddress} onChange={(e) => setEndAddress(e.target.value)}
            placeholder="Hämtas via GPS..." />
        </div>

        <div className="field">
          <label>Mätarställning slut (km)</label>
          {calcRoute
            ? <p className="info">Beräknar körsträcka...</p>
            : <input type="number" value={odometerEnd ?? ''} onChange={(e) => setOdometerEnd(parseInt(e.target.value))}
                placeholder="Auto-beräknas" />
          }
        </div>

        <div className="field">
          <label>Ändamål</label>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)}
            placeholder="T.ex. Kundmöte" />
        </div>

        <div className="row">
          <button className="btn gray" onClick={() => setPhase('active')}>Fortsätt</button>
          <button className="btn blue" onClick={handleSave} disabled={saving || calcRoute || !odometerEnd}>
            {saving ? 'Sparar...' : 'Spara resa'}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'scanning') {
    return (
      <div className="screen center">
        <div className="spinner" />
        <p className="status">{bleStatus || 'Söker...'}</p>
      </div>
    );
  }

  // idle / ready
  return (
    <div className="screen">
      <h1>Korjournal</h1>
      {error && <p className="error">{error}</p>}

      {phase === 'ready' && (
        <div className="card blue">
          <p className="label">OBD2 ansluten ✓</p>
          {soc !== null && <p className="sub">Batteri: {soc}%</p>}
          {odometer !== null && <p className="sub">Mätare: {Math.round(odometer).toLocaleString('sv-SE')} km</p>}
          {startAddress && <p className="sub">{startAddress}</p>}
        </div>
      )}

      {vehicles.length > 1 && (
        <div className="field">
          <label>Fordon</label>
          <select value={selectedVehicle} onChange={(e) => setSelectedVehicle(e.target.value)}>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.registration_number}</option>
            ))}
          </select>
        </div>
      )}

      {phase === 'ready' && (
        <div className="field">
          <label>Typ av resa</label>
          <div className="row">
            <button className={`toggle ${tripType === 'business' ? 'active-blue' : ''}`}
              onClick={() => setTripType('business')}>Tjänsteresa</button>
            <button className={`toggle ${tripType === 'private' ? 'active-purple' : ''}`}
              onClick={() => setTripType('private')}>Privatresa</button>
          </div>
        </div>
      )}

      {phase === 'idle' && (
        <button className="btn blue large" onClick={handleScan}>
          Anslut OBD2 & starta
        </button>
      )}

      {phase === 'ready' && (
        <button className="btn green large" onClick={handleStart} disabled={!selectedVehicle || !odometer}>
          Starta resa
        </button>
      )}
    </div>
  );
}
