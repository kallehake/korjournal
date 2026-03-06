import type { TypedSupabaseClient } from '../supabase';

/**
 * Export all user data for GDPR data portability (Article 20)
 */
export async function exportUserData(client: TypedSupabaseClient, userId: string) {
  const [profileRes, tripsRes, gpsRes] = await Promise.all([
    client.from('profiles').select('*').eq('id', userId).single(),
    client.from('trips').select('*').eq('driver_id', userId).order('date'),
    client.from('trips')
      .select('id')
      .eq('driver_id', userId)
      .then(async ({ data: trips }) => {
        if (!trips?.length) return { data: [] };
        const tripIds = trips.map((t) => t.id);
        return client.from('gps_points').select('*').in('trip_id', tripIds).order('timestamp');
      }),
  ]);

  return {
    profile: profileRes.data,
    trips: tripsRes.data ?? [],
    gps_points: gpsRes.data ?? [],
    exported_at: new Date().toISOString(),
  };
}

/**
 * Delete all user data for GDPR right to erasure (Article 17)
 * Note: This should be called via a server-side function with elevated privileges
 */
export async function deleteUserData(client: TypedSupabaseClient, userId: string) {
  // Get all trip IDs for the user
  const { data: trips } = await client
    .from('trips')
    .select('id')
    .eq('driver_id', userId);

  if (trips?.length) {
    const tripIds = trips.map((t) => t.id);

    // Delete GPS points for user's trips
    await client.from('gps_points').delete().in('trip_id', tripIds);

    // Delete trips
    await client.from('trips').delete().eq('driver_id', userId);
  }

  // Delete odometer readings recorded by user
  await client.from('odometer_readings').delete().eq('recorded_by', userId);

  // Delete profile (this will cascade from auth.users deletion)
  await client.from('profiles').delete().eq('id', userId);

  return { deleted: true, deleted_at: new Date().toISOString() };
}
