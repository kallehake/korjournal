import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

let taskDefined = false;

function ensureTaskDefined() {
  if (taskDefined) return;
  taskDefined = true;

  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, ({ data, error }: any) => {
    if (error) {
      console.error('Background location error:', error);
      return;
    }
    if (data) {
      const { locations } = data as { locations: Location.LocationObject[] };
      // Lazy-load store to avoid circular deps at module level
      const { useTripStore } = require('../stores/tripStore');
      const store = useTripStore.getState();

      locations.forEach((location: Location.LocationObject) => {
        store.addGpsPoint({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          altitude: location.coords.altitude,
          accuracy: location.coords.accuracy,
          speed: location.coords.speed,
          heading: location.coords.heading,
          timestamp: new Date(location.timestamp).toISOString(),
        });
      });
    }
  });
}

export async function requestLocationPermissions(): Promise<boolean> {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    return false;
  }

  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  if (backgroundStatus !== 'granted') {
    console.warn('Background location not granted, tracking will only work in foreground');
  }

  return true;
}

export async function startLocationTracking(): Promise<void> {
  ensureTaskDefined();

  const hasPermission = await requestLocationPermissions();
  if (!hasPermission) {
    throw new Error('Platsåtkomst nekad. Aktivera platsbehörighet i inställningarna.');
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 10,
    deferredUpdatesInterval: 5000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Körjournal',
      notificationBody: 'Spårar din resa...',
      notificationColor: '#2563eb',
    },
  });
}

export async function stopLocationTracking(): Promise<void> {
  const isTracking = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (isTracking) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

export async function getCurrentPosition(): Promise<Location.LocationObject> {
  return Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<string> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results.length > 0) {
      const addr = results[0];
      const parts: string[] = [];
      if (addr.street) {
        parts.push(addr.street);
        if (addr.streetNumber) parts[0] = `${addr.street} ${addr.streetNumber}`;
      }
      if (addr.city) parts.push(addr.city);
      return parts.join(', ') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }
  } catch (e) {
    console.warn('Reverse geocoding failed:', e);
  }
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}
