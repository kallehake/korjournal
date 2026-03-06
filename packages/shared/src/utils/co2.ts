import type { FuelType } from '../types';

/**
 * Average CO2 emissions per fuel type (g/km)
 * Based on Swedish Transport Agency averages 2024
 */
export const defaultCo2PerKm: Record<FuelType, number> = {
  petrol: 150,
  diesel: 130,
  electric: 0,
  hybrid: 90,
  plugin_hybrid: 50,
  other: 150,
};

/**
 * Average fuel consumption per fuel type (liters per 10 km)
 */
export const defaultFuelConsumption: Record<FuelType, number> = {
  petrol: 0.7,
  diesel: 0.6,
  electric: 0, // kWh instead
  hybrid: 0.5,
  plugin_hybrid: 0.3,
  other: 0.7,
};

/**
 * Average electricity consumption for EVs (kWh per 10 km)
 */
export const defaultElectricConsumption: Record<FuelType, number> = {
  petrol: 0,
  diesel: 0,
  electric: 2.0,
  hybrid: 0,
  plugin_hybrid: 1.0,
  other: 0,
};

/**
 * Calculate CO2 emissions for a trip
 */
export function calculateCo2(
  distanceKm: number,
  fuelType: FuelType,
  customCo2PerKm?: number
): number {
  const factor = customCo2PerKm ?? defaultCo2PerKm[fuelType];
  return (distanceKm * factor) / 1000; // Return in kg
}

/**
 * Calculate estimated fuel consumption
 */
export function calculateFuelConsumption(
  distanceKm: number,
  fuelType: FuelType,
  customConsumptionPer10km?: number
): { liters: number; kwh: number } {
  const fuelFactor = customConsumptionPer10km ?? defaultFuelConsumption[fuelType];
  const elecFactor = defaultElectricConsumption[fuelType];

  return {
    liters: (distanceKm / 10) * fuelFactor,
    kwh: (distanceKm / 10) * elecFactor,
  };
}

/**
 * Format CO2 for display
 */
export function formatCo2(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} ton`;
  return `${kg.toFixed(1)} kg`;
}
