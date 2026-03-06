import { useEffect, useRef } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
});

function AuthGuard() {
  const { user, isLoading, isInitialized, initialize } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, isInitialized, segments]);

  if (!isInitialized || isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1a56db" />
      </View>
    );
  }

  return <Slot />;
}

function TripDetectionManager() {
  const { user, profile, isInitialized } = useAuthStore();
  const detectionStarted = useRef(false);

  useEffect(() => {
    // Lazy-load auto trip store and hydrate
    try {
      const { useAutoTripStore } = require('@/stores/autoTripStore');
      useAutoTripStore.getState().hydrate();
    } catch (err) {
      console.error('Failed to hydrate auto trip store:', err);
    }

    // Request notification permissions
    (async () => {
      try {
        const Notifications = require('expo-notifications');
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
        await Notifications.requestPermissionsAsync();
      } catch (err) {
        console.warn('Notifications not available:', err);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isInitialized || !user || !profile) return;

    let autoTripStore: any;
    try {
      const mod = require('@/stores/autoTripStore');
      autoTripStore = mod.useAutoTripStore.getState();
    } catch {
      return;
    }

    if (!autoTripStore.isAutoMode || !autoTripStore.isHydrated) return;
    if (detectionStarted.current) return;

    detectionStarted.current = true;

    (async () => {
      try {
        const { startTripDetection } = require('@/services/tripDetection');
        const { startLocationTracking, stopLocationTracking, reverseGeocode } = require('@/services/location');
        const { useTripStore } = require('@/stores/tripStore');
        const { supabase } = require('@/lib/supabase');
        const defaultVehicleId = autoTripStore.defaultVehicleId;
        const defaultTripType = autoTripStore.defaultTripType;

        await startTripDetection({
          onTripStartSuggested: async (location: any) => {
            if (useTripStore.getState().isTracking) return;
            if (!defaultVehicleId) return;

            try {
              const addr = await reverseGeocode(
                location.coords.latitude,
                location.coords.longitude,
              );

              const { data: vehicle } = await supabase
                .from('vehicles')
                .select('current_odometer')
                .eq('id', defaultVehicleId)
                .single();

              await useTripStore.getState().startTrip({
                vehicleId: defaultVehicleId,
                driverId: profile.id,
                organizationId: profile.organization_id,
                startAddress: addr || 'Okänd adress',
                odometerStart: vehicle?.current_odometer ?? 0,
                tripType: defaultTripType,
              });

              await startLocationTracking();

              try {
                const Notifications = require('expo-notifications');
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: 'Resa startad',
                    body: 'Automatisk resa har startats.',
                  },
                  trigger: null,
                });
              } catch { /* notifications optional */ }
            } catch (err) {
              console.error('Auto-start trip failed:', err);
            }
          },

          onTripEndSuggested: async (_location: any) => {
            if (!useTripStore.getState().isTracking) return;

            try {
              await stopLocationTracking();
              autoTripStore.setPendingTripEnd(true);

              try {
                const Notifications = require('expo-notifications');
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: 'Resa avslutad',
                    body: 'Fyll i syfte och uppgifter för din resa (obligatoriskt).',
                  },
                  trigger: null,
                });
              } catch { /* notifications optional */ }
            } catch (err) {
              console.error('Auto-stop trip failed:', err);
            }
          },
        });
      } catch (err) {
        console.error('Trip detection setup failed:', err);
        detectionStarted.current = false;
      }
    })();

    return () => {
      try {
        const { stopTripDetection } = require('@/services/tripDetection');
        stopTripDetection();
      } catch { /* ignore */ }
      detectionStarted.current = false;
    };
  }, [isInitialized, user, profile]);

  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard />
      <TripDetectionManager />
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
});
