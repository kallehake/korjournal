/**
 * Format date to Swedish locale string (YYYY-MM-DD)
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

/**
 * Format time to HH:MM
 */
export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format distance in km with one decimal
 */
export function formatDistance(km: number | null | undefined): string {
  if (km == null) return '-';
  return `${km.toFixed(1)} km`;
}

/**
 * Format odometer reading
 */
export function formatOdometer(km: number | null | undefined): string {
  if (km == null) return '-';
  return `${km.toLocaleString('sv-SE')} km`;
}

/**
 * Get trip type label in Swedish
 */
export function tripTypeLabel(type: 'business' | 'private'): string {
  return type === 'business' ? 'Tjänsteresa' : 'Privatresa';
}

/**
 * Get trip status label in Swedish
 */
export function tripStatusLabel(status: 'active' | 'completed' | 'draft'): string {
  const labels: Record<string, string> = {
    active: 'Pågående',
    completed: 'Avslutad',
    draft: 'Utkast',
  };
  return labels[status] ?? status;
}
