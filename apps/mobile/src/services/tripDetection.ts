import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const GEOFENCE_TASK = 'trip-detection-geofence';
const SPEED_THRESHOLD_MPS = 3; // ~11 km/h - likely driving
const STILL_DURATION_MS = 180000; // 3 minutes of being still = trip ended
const MIN_TRIP_DISTANCE_M = 200; // Minimum distance before a trip is confirmed

interface TripDetectionCallbacks {
  onTripStartSuggested: (location: Location.LocationObject) => void;
  onTripEndSuggested: (location: Location.LocationObject) => void;
}

let callbacks: TripDetectionCallbacks | null = null;
let lastMovingTimestamp = 0;
let isMoving = false;
let tripStartLocation: { latitude: number; longitude: number } | null = null;
let tripConfirmed = false;
let taskDefined = false;

function distanceBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function ensureTaskDefined() {
  if (taskDefined) return;
  taskDefined = true;

  TaskManager.defineTask(GEOFENCE_TASK, ({ data, error }: any) => {
    if (error || !data) return;

    const { locations } = data as { locations: Location.LocationObject[] };
    const latest = locations[locations.length - 1];
    if (!latest) return;

    const speed = latest.coords.speed ?? 0;
    const now = Date.now();

    if (speed > SPEED_THRESHOLD_MPS) {
      if (!isMoving) {
        isMoving = true;
        tripStartLocation = {
          latitude: latest.coords.latitude,
          longitude: latest.coords.longitude,
        };
        tripConfirmed = false;
      }

      if (!tripConfirmed && tripStartLocation) {
        const dist = distanceBetween(
          tripStartLocation.latitude,
          tripStartLocation.longitude,
          latest.coords.latitude,
          latest.coords.longitude,
        );
        if (dist >= MIN_TRIP_DISTANCE_M) {
          tripConfirmed = true;
          callbacks?.onTripStartSuggested(latest);
        }
      }

      lastMovingTimestamp = now;
    } else if (isMoving && now - lastMovingTimestamp > STILL_DURATION_MS) {
      if (tripConfirmed) {
        callbacks?.onTripEndSuggested(latest);
      }
      isMoving = false;
      tripStartLocation = null;
      tripConfirmed = false;
    }
  });
}

export async function startTripDetection(cb: TripDetectionCallbacks): Promise<void> {
  callbacks = cb;

  ensureTaskDefined();

  const { status } = await Location.requestBackgroundPermissionsAsync();
  if (status !== 'granted') return;

  const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
  if (isRegistered) return;

  await Location.startLocationUpdatesAsync(GEOFENCE_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 30000,
    distanceInterval: 50,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: 'Körjournal',
      notificationBody: 'Automatisk resedetektering aktiv',
      notificationColor: '#2563eb',
    },
  });
}

export async function stopTripDetection(): Promise<void> {
  callbacks = null;
  isMoving = false;
  tripStartLocation = null;
  tripConfirmed = false;
  const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(GEOFENCE_TASK);
  }
}

export function triggerExternalTripStart(location: Location.LocationObject): void {
  if (!isMoving) {
    isMoving = true;
    tripConfirmed = true;
    tripStartLocation = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
    lastMovingTimestamp = Date.now();
    callbacks?.onTripStartSuggested(location);
  }
}

export function triggerExternalTripEnd(location: Location.LocationObject): void {
  if (isMoving && tripConfirmed) {
    callbacks?.onTripEndSuggested(location);
    isMoving = false;
    tripStartLocation = null;
    tripConfirmed = false;
  }
}
