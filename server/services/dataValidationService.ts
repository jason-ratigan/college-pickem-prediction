// server/services/dataValidationService.ts

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  normalizedData?: any;
}

export interface ApiTeam {
  id: number;
  school: string;
  conference?: string;
  classification?: string;
  logos?: string[];
}

export interface ApiGame {
  id: number;
  season: number;
  week: number;
  seasonType: string;
  startDate?: string;
  homeId: number;
  awayId: number;
  homePoints?: number;
  awayPoints?: number;
  completed: boolean;
}

export interface ApiStats {
  gameId: number;
  teamId: number;
  category: string;
  stat: string | number;
}

export class DataValidationService {
  
  /**
   * Validates team data from the API
   */
  validateTeamData(team: ApiTeam): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required field validation
    if (!team.id || typeof team.id !== 'number' || team.id <= 0) {
      errors.push('Team ID must be a positive number');
    }
    
    if (!team.school || typeof team.school !== 'string' || team.school.trim().length === 0) {
      errors.push('Team name (school) is required and cannot be empty');
    }
    
    if (team.school && team.school.length > 255) {
      errors.push('Team name cannot exceed 255 characters');
    }
    
    // Optional field validation
    if (team.conference && typeof team.conference !== 'string') {
      warnings.push('Conference should be a string');
    }
    
    if (team.classification && !['fbs', 'fcs', 'ii', 'iii'].includes(team.classification.toLowerCase())) {
      warnings.push(`Unknown classification: ${team.classification}`);
    }
    
    // Normalize the data
    const normalizedData = {
      id: team.id,
      school: team.school?.trim(),
      conference: team.conference?.trim() || null,
      classification: team.classification?.toLowerCase() || null,
      logos: Array.isArray(team.logos) ? team.logos : []
    };
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      normalizedData
    };
  }
  
  /**
   * Validates game data from the API
   */
  validateGameData(game: ApiGame): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required field validation
    if (!game.id || typeof game.id !== 'number' || game.id <= 0) {
      errors.push('Game ID must be a positive number');
    }
    
    if (!game.season || typeof game.season !== 'number' || game.season < 1900 || game.season > new Date().getFullYear() + 1) {
      errors.push('Season must be a valid year');
    }
    
    if (typeof game.week !== 'number' || game.week < 0 || game.week > 20) {
      errors.push('Week must be between 0 and 20');
    }
    
    if (!game.seasonType || !['regular', 'postseason'].includes(game.seasonType)) {
      errors.push('Season type must be "regular" or "postseason"');
    }
    
    if (!game.homeId || typeof game.homeId !== 'number' || game.homeId <= 0) {
      errors.push('Home team ID must be a positive number');
    }
    
    if (!game.awayId || typeof game.awayId !== 'number' || game.awayId <= 0) {
      errors.push('Away team ID must be a positive number');
    }
    
    if (game.homeId === game.awayId) {
      errors.push('Home and away teams cannot be the same');
    }
    
    // Score validation (if game is completed)
    if (game.completed) {
      if (typeof game.homePoints !== 'number' || game.homePoints < 0) {
        errors.push('Home team score must be a non-negative number for completed games');
      }
      
      if (typeof game.awayPoints !== 'number' || game.awayPoints < 0) {
        errors.push('Away team score must be a non-negative number for completed games');
      }
      
      // Sanity check for extremely high scores
      if (game.homePoints && game.homePoints > 200) {
        warnings.push(`Unusually high home team score: ${game.homePoints}`);
      }
      
      if (game.awayPoints && game.awayPoints > 200) {
        warnings.push(`Unusually high away team score: ${game.awayPoints}`);
      }
    }
    
    // Date validation
    if (game.startDate) {
      const gameDate = new Date(game.startDate);
      if (isNaN(gameDate.getTime())) {
        warnings.push('Invalid start date format');
      }
    }
    
    // Normalize the data
    const normalizedData = {
      id: game.id,
      season: game.season,
      week: game.week,
      seasonType: game.seasonType,
      startDate: game.startDate || null,
      homeId: game.homeId,
      awayId: game.awayId,
      homePoints: game.homePoints || null,
      awayPoints: game.awayPoints || null,
      completed: Boolean(game.completed)
    };
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      normalizedData
    };
  }
  
  /**
   * Validates statistical data from the API
   */
  validateStatisticalData(stats: ApiStats): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required field validation
    if (!stats.gameId || typeof stats.gameId !== 'number' || stats.gameId <= 0) {
      errors.push('Game ID must be a positive number');
    }
    
    if (!stats.teamId || typeof stats.teamId !== 'number' || stats.teamId <= 0) {
      errors.push('Team ID must be a positive number');
    }
    
    if (!stats.category || typeof stats.category !== 'string' || stats.category.trim().length === 0) {
      errors.push('Statistical category is required');
    }
    
    if (stats.stat === null || stats.stat === undefined) {
      errors.push('Statistical value is required');
    }
    
    // Validate statistical ranges
    if (typeof stats.stat === 'number') {
      // Most stats should be non-negative
      if (stats.stat < 0 && !['netPassingYards', 'rushingYards'].includes(stats.category)) {
        warnings.push(`Negative value for ${stats.category}: ${stats.stat}`);
      }
      
      // Sanity checks for common stats
      switch (stats.category) {
        case 'totalYards':
          if (stats.stat > 1000) warnings.push(`Unusually high total yards: ${stats.stat}`);
          break;
        case 'passingTDs':
        case 'rushingTDs':
          if (stats.stat > 15) warnings.push(`Unusually high TDs for ${stats.category}: ${stats.stat}`);
          break;
        case 'turnovers':
          if (stats.stat > 10) warnings.push(`Unusually high turnovers: ${stats.stat}`);
          break;
      }
    }
    
    // Normalize the data
    const normalizedData = {
      gameId: stats.gameId,
      teamId: stats.teamId,
      category: stats.category.trim(),
      stat: stats.stat
    };
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      normalizedData
    };
  }
  
  /**
   * Normalizes team names to handle variations
   */
  normalizeTeamName(name: string): string {
    if (!name) return '';
    
    return name
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s\-&()]/g, '') // Remove special characters except common ones
      .substring(0, 255); // Ensure it fits in database field
  }
  
  /**
   * Validates prediction values for sanity
   */
  validatePrediction(homeScore: number, awayScore: number, homeTeamAvg: number, awayTeamAvg: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Basic validation
    if (homeScore < 0 || awayScore < 0) {
      errors.push('Predicted scores cannot be negative');
    }
    
    if (homeScore > 200 || awayScore > 200) {
      errors.push('Predicted scores over 200 are unrealistic');
    }
    
    // Sanity checks against team averages
    if (homeTeamAvg > 0 && homeScore < homeTeamAvg * 0.3) {
      warnings.push(`Home team predicted score (${homeScore}) is unusually low compared to average (${homeTeamAvg})`);
    }
    
    if (awayTeamAvg > 0 && awayScore < awayTeamAvg * 0.3) {
      warnings.push(`Away team predicted score (${awayScore}) is unusually low compared to average (${awayTeamAvg})`);
    }
    
    if (homeTeamAvg > 0 && homeScore > homeTeamAvg * 3) {
      warnings.push(`Home team predicted score (${homeScore}) is unusually high compared to average (${homeTeamAvg})`);
    }
    
    if (awayTeamAvg > 0 && awayScore > awayTeamAvg * 3) {
      warnings.push(`Away team predicted score (${awayScore}) is unusually high compared to average (${awayTeamAvg})`);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      normalizedData: { homeScore, awayScore }
    };
  }
  
  /**
   * Batch validates an array of items
   */
  batchValidate<T>(items: T[], validator: (item: T) => ValidationResult): {
    validItems: T[];
    invalidItems: { item: T; result: ValidationResult }[];
    totalErrors: number;
    totalWarnings: number;
  } {
    const validItems: T[] = [];
    const invalidItems: { item: T; result: ValidationResult }[] = [];
    let totalErrors = 0;
    let totalWarnings = 0;
    
    for (const item of items) {
      const result = validator(item);
      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;
      
      if (result.isValid) {
        validItems.push(result.normalizedData || item);
      } else {
        invalidItems.push({ item, result });
      }
    }
    
    return { validItems, invalidItems, totalErrors, totalWarnings };
  }
}

// Export singleton instance
export const dataValidationService = new DataValidationService();