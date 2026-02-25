import { useState, useEffect } from 'react';
import {
  STORAGE_KEYS,
  DEFAULT_VALUES,
  getStoredValue,
  setStoredValue,
  validateSeason,
  validateWeek,
  validateConference,
} from '../utils/filterStorage';

/**
 * Options for configuring the usePersistedFilters hook
 */
export interface UsePersistedFiltersOptions {
  currentWeek?: { season: number; week: number };
  availableSeasons?: Record<string, number[]>;
  availableConferences?: string[];
  availableClassifications?: string[];
  isAdmin?: boolean;
}

/**
 * Return type for the usePersistedFilters hook
 */
export interface UsePersistedFiltersReturn {
  season: number | null;
  week: number | null;
  conference: string;
  featuredOnly: boolean;
  setSeason: (season: number) => void;
  setWeek: (week: number) => void;
  setConference: (conference: string) => void;
  setFeaturedOnly: (featured: boolean) => void;
}

/**
 * Custom hook for managing persisted filter state in localStorage
 * 
 * This hook handles:
 * - Reading filter preferences from localStorage on mount
 * - Validating saved values against available options
 * - Updating both React state and localStorage when filters change
 * - Coordinating season/week dependencies
 * 
 * @param options - Configuration options including current week and available filter values
 * @returns Filter state and setter functions
 */
export function usePersistedFilters(
  options: UsePersistedFiltersOptions
): UsePersistedFiltersReturn {
  const {
    currentWeek,
    availableSeasons,
    availableConferences,
    availableClassifications,
    isAdmin = false,
  } = options;

  // Initialize state from localStorage
  const [season, setSeason] = useState<number | null>(() => {
    const stored = getStoredValue<number | null>(STORAGE_KEYS.SEASON, null);
    return validateSeason(stored, availableSeasons);
  });

  const [week, setWeek] = useState<number | null>(() => {
    const stored = getStoredValue<number | null>(STORAGE_KEYS.WEEK, null);
    return validateWeek(stored, season, availableSeasons);
  });

  const [conference, setConference] = useState<string>(() => {
    const stored = getStoredValue<string>(STORAGE_KEYS.CONFERENCE, DEFAULT_VALUES.CONFERENCE);
    return validateConference(stored, availableConferences, availableClassifications);
  });

  const [featuredOnly, setFeaturedOnly] = useState<boolean>(() => {
    // Only load featured state if user is admin
    if (!isAdmin) return DEFAULT_VALUES.FEATURED;
    return getStoredValue<boolean>(STORAGE_KEYS.FEATURED, DEFAULT_VALUES.FEATURED);
  });

  // Effect: Initialize season/week from currentWeek if no saved values
  useEffect(() => {
    if (currentWeek && season === null) {
      setSeason(currentWeek.season);
      setWeek(currentWeek.week);
      setStoredValue(STORAGE_KEYS.SEASON, currentWeek.season);
      setStoredValue(STORAGE_KEYS.WEEK, currentWeek.week);
    }
  }, [currentWeek, season]);

  // Effect: Revalidate all saved preferences when filter data becomes available
  useEffect(() => {
    if (!availableSeasons) return;

    // Revalidate season
    const validatedSeason = validateSeason(season, availableSeasons);
    if (validatedSeason !== season) {
      setSeason(validatedSeason);
      if (validatedSeason !== null) {
        setStoredValue(STORAGE_KEYS.SEASON, validatedSeason);
      }
    }

    // Revalidate week for current season
    const validatedWeek = validateWeek(week, season, availableSeasons);
    if (validatedWeek !== week) {
      setWeek(validatedWeek);
      if (validatedWeek !== null) {
        setStoredValue(STORAGE_KEYS.WEEK, validatedWeek);
      }
    }
  }, [availableSeasons, season, week]);

  // Effect: Revalidate conference when available options change
  useEffect(() => {
    if (!availableConferences && !availableClassifications) return;

    const validatedConference = validateConference(
      conference,
      availableConferences,
      availableClassifications
    );
    
    if (validatedConference !== conference) {
      setConference(validatedConference);
      setStoredValue(STORAGE_KEYS.CONFERENCE, validatedConference);
    }
  }, [availableConferences, availableClassifications, conference]);

  // Effect: When season changes, validate that week is still valid
  useEffect(() => {
    if (!season || !availableSeasons) return;

    const validatedWeek = validateWeek(week, season, availableSeasons);
    
    // If week is invalid for new season, default to first available week
    if (validatedWeek === null && availableSeasons[season.toString()]) {
      const firstWeek = availableSeasons[season.toString()][0];
      if (firstWeek !== undefined) {
        setWeek(firstWeek);
        setStoredValue(STORAGE_KEYS.WEEK, firstWeek);
      }
    } else if (validatedWeek !== week) {
      setWeek(validatedWeek);
      if (validatedWeek !== null) {
        setStoredValue(STORAGE_KEYS.WEEK, validatedWeek);
      }
    }
  }, [season, availableSeasons, week]);

  // Setter functions that update both state and localStorage
  const handleSetSeason = (newSeason: number) => {
    setSeason(newSeason);
    setStoredValue(STORAGE_KEYS.SEASON, newSeason);
  };

  const handleSetWeek = (newWeek: number) => {
    setWeek(newWeek);
    setStoredValue(STORAGE_KEYS.WEEK, newWeek);
  };

  const handleSetConference = (newConference: string) => {
    setConference(newConference);
    setStoredValue(STORAGE_KEYS.CONFERENCE, newConference);
  };

  const handleSetFeaturedOnly = (newFeatured: boolean) => {
    setFeaturedOnly(newFeatured);
    // Only persist if user is admin
    if (isAdmin) {
      setStoredValue(STORAGE_KEYS.FEATURED, newFeatured);
    }
  };

  return {
    season,
    week,
    conference,
    featuredOnly,
    setSeason: handleSetSeason,
    setWeek: handleSetWeek,
    setConference: handleSetConference,
    setFeaturedOnly: handleSetFeaturedOnly,
  };
}
