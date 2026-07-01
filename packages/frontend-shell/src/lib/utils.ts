import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(value: string): string {
  if (!value.trim()) {
    return '?';
  }

  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}
