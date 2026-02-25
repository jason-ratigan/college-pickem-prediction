/**
 * Storage utility functions for managing localStorage with error handling
 * and TypeScript type safety
 */

// Storage keys for filter preferences
export const STORAGE_KEYS = {
  SEASON: 'games-hub:season',
  WEEK: 'games-hub:week',
  CONFERENCE: 'games-hub:conference',
  FEATURED: 'games-hub:featured',
} as const;

// Default values for filters
export const DEFAULT_VALUES = {
  CONFERENCE: 'all',
  FEATURED: false,
} as const;

/**
 * Get a value from localStorage with error handling and type safety
 * @param key - The localStorage key
 * @param defaultValue - The default value to return if key doesn't exist or error occurs
 * @returns The stored value or default value
 */
export function getStoredValue<T>(key: string, defaultValue: T): T {
  try {
    const item = window.localStorage.getItem(key);
    if (item === null) {
      return defaultValue;
    }
    
    // Parse the stored value
    const parsed = JSON.parse(item);
    return parsed as T;
  } catch (error) {
    console.warn(`Failed to read from localStorage (key: ${key}):`, error);
    return defaultValue;
  }
}

/**
 * Set a value in localStorage with error handling
 * @param key - The localStorage key
 * @param value - The value to store
 */
export function setStoredValue<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to write to localStorage (key: ${key}):`, error);
  }
}

/**
 * Validate that a season exists in the available seasons
 * @param season - The season to validate
 * @param availableSeasons - Record of seasons and their available weeks
 * @returns The validated season or null if invalid
 */
export function validateSeason(
  season: number | null,
  availableSeasons?: Record<string, number[]>
): number | null {
  if (season === null || !availableSeasons) {
    return null;
  }

  const seasonKey = season.toString();
  if (seasonKey in availableSeasons) {
    return season;
  }

  console.warn(`Validation failed: Season ${season} is not available. Defaulting to null.`);
  return null;
}

/**
 * Validate that a week exists for the given season
 * @param week - The week to validate
 * @param season - The season the week belongs to
 * @param availableSeasons - Record of seasons and their available weeks
 * @returns The validated week or null if invalid
 */
export function validateWeek(
  week: number | null,
  season: number | null,
  availableSeasons?: Record<string, number[]>
): number | null {
  if (week === null || season === null || !availableSeasons) {
    return null;
  }

  const seasonKey = season.toString();
  const availableWeeks = availableSeasons[seasonKey];
  
  if (!availableWeeks) {
    console.warn(`Validation failed: No weeks available for season ${season}. Defaulting to null.`);
    return null;
  }

  if (availableWeeks.includes(week)) {
    return week;
  }

  console.warn(`Validation failed: Week ${week} is not available for season ${season}. Defaulting to null.`);
  return null;
}

/**
 * Validate that a conference or classification exists in available options
 * @param conference - The conference/classification to validate
 * @param availableConferences - Array of available conference names
 * @param availableClassifications - Array of available classification names
 * @returns The validated conference or "all" if invalid
 */
export function validateConference(
  conference: string,
  availableConferences?: string[],
  availableClassifications?: string[]
): string {
  // "all" is always valid
  if (conference === 'all') {
    return conference;
  }

  // If no options available yet, return the value as-is (will be validated later)
  if (!availableConferences && !availableClassifications) {
    return conference;
  }

  // Check if conference exists in available conferences
  if (availableConferences && availableConferences.includes(conference)) {
    return conference;
  }

  // Check if conference exists in available classifications
  if (availableClassifications && availableClassifications.includes(conference)) {
    return conference;
  }

  console.warn(`Validation failed: Conference/classification "${conference}" is not available. Defaulting to "all".`);
  return DEFAULT_VALUES.CONFERENCE;
}
