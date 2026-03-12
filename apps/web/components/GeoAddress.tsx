'use client';

import { useState, useEffect } from 'react';

// Module-level cache shared across all instances
const cache = new Map<string, string>();

const COORD_RE = /^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+$/;

function isCoord(s: string) {
  return COORD_RE.test(s.trim());
}

interface Props {
  address: string | null | undefined;
  fallback?: string;
}

export default function GeoAddress({ address, fallback = '–' }: Props) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !isCoord(address)) return;
    if (cache.has(address)) { setLabel(cache.get(address)!); return; }
    const [lat, lng] = address.split(',').map(s => s.trim());
    fetch(`/api/geocode?lat=${lat}&lng=${lng}`)
      .then(r => r.json())
      .then(d => {
        if (d.label) { cache.set(address, d.label); setLabel(d.label); }
      })
      .catch(() => {});
  }, [address]);

  if (!address) return <>{fallback}</>;
  // Already a place name
  if (!isCoord(address)) return <>{address}</>;
  // Coordinate — show geocoded name or raw coords while loading
  return <>{label ?? address}</>;
}
