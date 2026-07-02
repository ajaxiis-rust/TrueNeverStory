/**
 * Time utilities.
 */

export function isoNow(): string {
  return new Date().toISOString();
}

export function plusMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function plusHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function minusHours(date: Date, hours: number): Date {
  return plusHours(date, -hours);
}

export function minusDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}
