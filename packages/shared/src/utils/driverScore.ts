/**
 * Calculate driver behavior score from GPS data
 */

interface GpsPoint {
  latitude: number;
  longitude: number;
  speed: number | null; // m/s
  heading: number | null;
  timestamp: string;
}

interface ScoreResult {
  overall_score: number;
  acceleration_score: number;
  braking_score: number;
  speeding_score: number;
  idle_score: number;
  harsh_events: number;
  max_speed_kmh: number;
  avg_speed_kmh: number;
  idle_duration_seconds: number;
}

// Thresholds
const HARSH_ACCEL_THRESHOLD = 3.0; // m/s² (about 0.3g)
const HARSH_BRAKE_THRESHOLD = -4.0; // m/s²
const SPEED_LIMIT_CITY = 50; // km/h
const SPEED_LIMIT_HIGHWAY = 120; // km/h
const IDLE_SPEED_THRESHOLD = 1; // km/h

/**
 * Analyze GPS points and calculate a driver behavior score (0-100)
 */
export function calculateDriverScore(points: GpsPoint[]): ScoreResult {
  if (points.length < 2) {
    return {
      overall_score: 100,
      acceleration_score: 100,
      braking_score: 100,
      speeding_score: 100,
      idle_score: 100,
      harsh_events: 0,
      max_speed_kmh: 0,
      avg_speed_kmh: 0,
      idle_duration_seconds: 0,
    };
  }

  let harshAccelCount = 0;
  let harshBrakeCount = 0;
  let speedingCount = 0;
  let idleDuration = 0;
  let maxSpeed = 0;
  let totalSpeed = 0;
  let speedPoints = 0;
  let totalIntervals = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    const prevSpeed = (prev.speed ?? 0) * 3.6; // m/s -> km/h
    const currSpeed = (curr.speed ?? 0) * 3.6;
    const timeDiff = (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;

    if (timeDiff <= 0 || timeDiff > 30) continue; // Skip gaps
    totalIntervals++;

    // Speed stats
    if (currSpeed > maxSpeed) maxSpeed = currSpeed;
    totalSpeed += currSpeed;
    speedPoints++;

    // Acceleration (m/s²)
    const accel = ((curr.speed ?? 0) - (prev.speed ?? 0)) / timeDiff;

    if (accel > HARSH_ACCEL_THRESHOLD) harshAccelCount++;
    if (accel < HARSH_BRAKE_THRESHOLD) harshBrakeCount++;

    // Speeding (simple heuristic - any speed > 120 km/h or sustained > 90 in city areas)
    if (currSpeed > SPEED_LIMIT_HIGHWAY) speedingCount++;

    // Idle detection
    if (currSpeed < IDLE_SPEED_THRESHOLD) {
      idleDuration += timeDiff;
    }
  }

  const totalSamples = Math.max(totalIntervals, 1);
  const harshEvents = harshAccelCount + harshBrakeCount;

  // Score calculation (100 = perfect, deduct for issues)
  const accelScore = Math.max(0, 100 - harshAccelCount * 10);
  const brakeScore = Math.max(0, 100 - harshBrakeCount * 8);
  const speedScore = Math.max(0, 100 - (speedingCount / totalSamples) * 200);
  const idleScore = idleDuration > 300
    ? Math.max(0, 100 - ((idleDuration - 300) / 60) * 5)
    : 100;

  const overall = Math.round(
    accelScore * 0.25 + brakeScore * 0.25 + speedScore * 0.35 + idleScore * 0.15
  );

  return {
    overall_score: Math.min(100, Math.max(0, overall)),
    acceleration_score: Math.round(accelScore),
    braking_score: Math.round(brakeScore),
    speeding_score: Math.round(speedScore),
    idle_score: Math.round(idleScore),
    harsh_events: harshEvents,
    max_speed_kmh: Math.round(maxSpeed * 10) / 10,
    avg_speed_kmh: speedPoints > 0 ? Math.round((totalSpeed / speedPoints) * 10) / 10 : 0,
    idle_duration_seconds: Math.round(idleDuration),
  };
}

/**
 * Get a label for a score range
 */
export function scoreLabel(score: number): string {
  if (score >= 90) return 'Utmärkt';
  if (score >= 75) return 'Bra';
  if (score >= 60) return 'Godkänt';
  if (score >= 40) return 'Behöver förbättras';
  return 'Dåligt';
}

/**
 * Get a color for a score range
 */
export function scoreColor(score: number): string {
  if (score >= 90) return '#16a34a';
  if (score >= 75) return '#65a30d';
  if (score >= 60) return '#ca8a04';
  if (score >= 40) return '#ea580c';
  return '#dc2626';
}
