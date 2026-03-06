import * as SQLite from 'expo-sqlite';
import { supabase } from '../lib/supabase';
import NetInfo from '@react-native-community/netinfo';

const DB_NAME = 'korjournal_offline.db';

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_gps_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        altitude REAL,
        accuracy REAL,
        speed REAL,
        heading REAL,
        timestamp TEXT NOT NULL,
        synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS pending_trip_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id TEXT NOT NULL,
        update_data TEXT NOT NULL,
        synced INTEGER DEFAULT 0
      );
    `);
  }
  return db;
}

export async function saveGpsPointOffline(
  tripId: string,
  point: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    timestamp: string;
  }
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO pending_gps_points (trip_id, latitude, longitude, altitude, accuracy, speed, heading, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tripId, point.latitude, point.longitude, point.altitude, point.accuracy, point.speed, point.heading, point.timestamp]
  );
}

export async function saveTripUpdateOffline(
  tripId: string,
  updateData: Record<string, any>
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO pending_trip_updates (trip_id, update_data) VALUES (?, ?)`,
    [tripId, JSON.stringify(updateData)]
  );
}

export async function syncPendingData(): Promise<{ synced: number; errors: number }> {
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) {
    return { synced: 0, errors: 0 };
  }

  const database = await getDb();
  let synced = 0;
  let errors = 0;

  // Sync GPS points in batches
  const pendingPoints = await database.getAllAsync<{
    id: number;
    trip_id: string;
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    timestamp: string;
  }>('SELECT * FROM pending_gps_points WHERE synced = 0 LIMIT 500');

  if (pendingPoints.length > 0) {
    const pointsToInsert = pendingPoints.map((p) => ({
      trip_id: p.trip_id,
      latitude: p.latitude,
      longitude: p.longitude,
      altitude: p.altitude,
      accuracy: p.accuracy,
      speed: p.speed,
      heading: p.heading,
      timestamp: p.timestamp,
    }));

    const { error } = await supabase.from('gps_points').insert(pointsToInsert);
    if (!error) {
      const ids = pendingPoints.map((p) => p.id);
      await database.runAsync(
        `UPDATE pending_gps_points SET synced = 1 WHERE id IN (${ids.join(',')})`
      );
      synced += pendingPoints.length;
    } else {
      errors += pendingPoints.length;
    }
  }

  // Sync trip updates
  const pendingUpdates = await database.getAllAsync<{
    id: number;
    trip_id: string;
    update_data: string;
  }>('SELECT * FROM pending_trip_updates WHERE synced = 0');

  for (const update of pendingUpdates) {
    const data = JSON.parse(update.update_data);
    const { error } = await supabase
      .from('trips')
      .update(data)
      .eq('id', update.trip_id);

    if (!error) {
      await database.runAsync(
        'UPDATE pending_trip_updates SET synced = 1 WHERE id = ?',
        [update.id]
      );
      synced++;
    } else {
      errors++;
    }
  }

  // Clean up synced records
  await database.runAsync('DELETE FROM pending_gps_points WHERE synced = 1');
  await database.runAsync('DELETE FROM pending_trip_updates WHERE synced = 1');

  return { synced, errors };
}

export async function getPendingCount(): Promise<number> {
  const database = await getDb();
  const result = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM pending_gps_points WHERE synced = 0'
  );
  return result?.count ?? 0;
}
