import { useState, useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '../services/supabase';

const isNative = Capacitor.isNativePlatform();

interface TripMonitorPlugin {
  startService(): Promise<void>;
  stopService(): Promise<void>;
  saveSession(opts: { accessToken: string; driverId: string; orgId: string; vehicleId: string }): Promise<void>;
  addListener(event: string, handler: (data: any) => void): Promise<{ remove: () => void }>;
}

const TripMonitor = registerPlugin<TripMonitorPlugin>('TripMonitor');

interface ActiveTrip {
  id: string;
  km?: number;
  tripType?: 'business' | 'private';
  zoneName?: string;
}

export default function DriveScreen() {
  const [status, setStatus] = useState(
    isNative ? 'Startar bakgrundstjänst...' : 'Webbläsarläge — bakgrundstjänst ej tillgänglig'
  );
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [completedTrip, setCompletedTrip] = useState<ActiveTrip | null>(null);
  const [purpose, setPurpose] = useState('');
  const [tripType, setTripType] = useState<'business' | 'private'>('business');
  const [saving, setSaving] = useState(false);
  const [vehicles, setVehicles] = useState<{ id: string; registration_number: string }[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [serviceError, setServiceError] = useState('');

  useEffect(() => {
    let listeners: { remove: () => void }[] = [];

    async function init() {
      // Load vehicles
      const { data: veh, error: vehError } = await supabase
        .from('vehicles').select('id, registration_number').eq('is_active', true);

      if (vehError) {
        setStatus('Kunde inte ladda fordon: ' + vehError.message);
        return;
      }
      if (veh?.length) {
        setVehicles(veh);
        setSelectedVehicle(veh[0].id);
      } else {
        setStatus('Inga aktiva fordon — lägg till ett fordon i webbappen');
        return;
      }

      // Skip native calls when running in browser
      if (!isNative) {
        setStatus('Webbläsarläge — installera Android-appen för automatisk loggning');
        return;
      }

      // Get session and save for background service
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase.from('profiles')
          .select('id, organization_id').eq('id', session.user.id).single();
        if (profile) {
          await TripMonitor.saveSession({
            accessToken: session.access_token,
            driverId: profile.id,
            orgId: profile.organization_id,
            vehicleId: veh[0].id,
          });
        }
      }

      // Start background service — plugin requests permissions if needed
      try {
        await TripMonitor.startService();
      } catch (e: any) {
        const msg = e?.message || 'Okänt fel';
        setServiceError('Bakgrundstjänst misslyckades: ' + msg);
        setStatus('Kontrollera tillstånd i Inställningar → Appar → Korjournal');
        return;
      }

      // Listen for events from background service
      const l1 = await TripMonitor.addListener('statusChanged', ({ status: s }) => setStatus(s));
      const l2 = await TripMonitor.addListener('tripStarted', ({ tripId }) => {
        setActiveTrip({ id: tripId });
        setCompletedTrip(null);
      });
      const l3 = await TripMonitor.addListener('tripEnded', ({ tripId, km, tripType, zoneName }) => {
        setActiveTrip(null);
        setCompletedTrip({ id: tripId, km, tripType, zoneName });
        if (tripType) setTripType(tripType);
        if (zoneName) setPurpose(zoneName);
      });
      listeners = [l1, l2, l3];
    }

    init().catch((e) => {
      console.error('Init error:', e);
      setStatus('Startfel: ' + (e?.message || 'okänt'));
    });
    return () => listeners.forEach((l) => l.remove());
  }, []);

  async function saveDetails() {
    if (!completedTrip) return;
    setSaving(true);
    await supabase.from('trips').update({
      purpose: purpose || null,
      trip_type: tripType,
    }).eq('id', completedTrip.id);
    setCompletedTrip(null);
    setPurpose('');
    setSaving(false);
  }

  // ── Resa pågår ───────────────────────────────────────────────────────────
  if (activeTrip) {
    return (
      <div className="screen center">
        <div className="card green" style={{ width: '100%' }}>
          <p className="label">Resa pågår</p>
          <div className="spinner" style={{ margin: '16px auto' }} />
          <p className="sub" style={{ textAlign: 'center' }}>Resan loggas automatiskt</p>
          <p className="sub" style={{ textAlign: 'center', fontSize: '0.8rem', color: '#6b7280', marginTop: 4 }}>
            {status}
          </p>
        </div>
      </div>
    );
  }

  // ── Resa avslutad — lägg till detaljer ───────────────────────────────────
  if (completedTrip) {
    return (
      <div className="screen">
        <div className="card blue">
          <p className="label">Resa avslutad</p>
          {completedTrip.km !== undefined && (
            <p className="timer" style={{ fontSize: '2.5rem' }}>{completedTrip.km} km</p>
          )}
          {completedTrip.zoneName && (
            <p className="sub" style={{ color: '#16a34a', fontWeight: 600 }}>
              Zon: {completedTrip.zoneName}
            </p>
          )}
        </div>

        <div className="field">
          <label>Typ av resa</label>
          <div className="row">
            <button className={`toggle ${tripType === 'business' ? 'active-blue' : ''}`}
              onClick={() => setTripType('business')}>Tjänsteresa</button>
            <button className={`toggle ${tripType === 'private' ? 'active-purple' : ''}`}
              onClick={() => setTripType('private')}>Privatresa</button>
          </div>
        </div>

        <div className="field">
          <label>Ändamål (valfritt)</label>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)}
            placeholder="T.ex. Kundmöte, leverans..." />
        </div>

        <button className="btn blue large" onClick={saveDetails} disabled={saving}>
          {saving ? 'Sparar...' : 'Spara och klar'}
        </button>
      </div>
    );
  }

  // ── Standby ───────────────────────────────────────────────────────────────
  return (
    <div className="screen center">
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
          🚗
        </div>
        <h1>Korjournal</h1>
        <p className="sub">Resor startas och loggas automatiskt när bilen kör.</p>
        <p className="status">{status}</p>

        {serviceError && (
          <div className="error" style={{ width: '100%', textAlign: 'left' }}>
            {serviceError}
          </div>
        )}

        {vehicles.length > 1 && (
          <div className="field" style={{ width: '100%', textAlign: 'left' }}>
            <label>Aktivt fordon</label>
            <select value={selectedVehicle} onChange={async (e) => {
              const vid = e.target.value;
              setSelectedVehicle(vid);
              if (!isNative) return;
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.user) {
                const { data: profile } = await supabase.from('profiles')
                  .select('id, organization_id').eq('id', session.user.id).single();
                if (profile) {
                  await TripMonitor.saveSession({
                    accessToken: session.access_token,
                    driverId: profile.id,
                    orgId: profile.organization_id,
                    vehicleId: vid,
                  });
                }
              }
            }}>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.registration_number}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
