import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseUser } from '../_shared/supabase.ts';

interface GeocodeRequest {
  latitude: number;
  longitude: number;
}

interface GeocodeResponse {
  address: string;
  city: string | null;
  zip_code: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user is authenticated
    const supabase = createSupabaseUser(authHeader);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { latitude, longitude }: GeocodeRequest = await req.json();

    if (!latitude || !longitude) {
      return new Response(JSON.stringify({ error: 'latitude and longitude required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use Nominatim for reverse geocoding (free, no API key needed)
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=sv`;

    const response = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'Korjournal/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim error: ${response.status}`);
    }

    const data = await response.json();

    const address = data.display_name || `${latitude}, ${longitude}`;
    const city = data.address?.city || data.address?.town || data.address?.village || null;
    const zipCode = data.address?.postcode || null;

    // Build a shorter, more useful address
    const parts: string[] = [];
    if (data.address?.road) {
      parts.push(data.address.road);
      if (data.address?.house_number) {
        parts[0] += ` ${data.address.house_number}`;
      }
    }
    if (city) parts.push(city);

    const shortAddress = parts.length > 0 ? parts.join(', ') : address;

    const result: GeocodeResponse = {
      address: shortAddress,
      city,
      zip_code: zipCode,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
