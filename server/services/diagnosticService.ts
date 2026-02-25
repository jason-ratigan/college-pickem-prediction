// server/services/diagnosticService.ts

import { db } from '../db.js';
import { teams, games, teamEfficiencyRatings, gameBoxScoreStats } from '@college-pickem/shared';
import { eq, and, sql, isNull, notInArray, inArray } from 'drizzle-orm';

export interface TeamDiagnostic {
  teamId: number;
  teamName: string;
  conference: string | null;
  classification: string | null;
  gamesPlayed: number;
  fbsGamesPlayed: number;
  hasEfficiencyRatings: boolean;
  hasBoxScoreStats: boolean;
  missingDataReasons: string[];
  dataQuality: 'Excellent' | 'Good' | 'Limited' | 'Insufficient';
}

export interface SeasonDiagnostic {
  season: number;
  totalTeams: number;
  teamsWithGames: number;
  teamsWithRatings: number;
  teamsWithoutRatings: TeamDiagnostic[];
  dataCompleteness: number;
  commonIssues: string[];
  recommendations: string[];
}

export interface SystemHealthReport {
  overallHealth: 'Healthy' | 'Warning' | 'Critical';
  lastUpdated: Date;
  seasons: SeasonDiagnostic[];
  criticalIssues: string[];
  performanceMetrics: {
    avgProcessingTime: number;
    errorRate: number;
    dataFreshness: number; // hours since last update
  };
}

export class DiagnosticService {
  
  /**
   * Diagnoses teams missing efficiency ratings for a specific season
   */
  async diagnoseTeamEfficiencyRatings(season: number): Promise<TeamDiagnostic[]> {
    console.log(`[Diagnostic] Analyzing team efficiency ratings for season ${season}...`);
    
    // Get all teams that have played games in this season
    const teamsWithGames = await db.select({
      teamId: teams.id,
      teamName: teams.name,
      conference: teams.conference,
      classification: teams.classification,
      apiTeamId: teams.apiTeamId,
    })
    .from(teams)
    .innerJoin(games, sql`${teams.id} = ${games.homeTeamId} OR ${teams.id} = ${games.awayTeamId}`)
    .where(eq(games.season, season))
    .groupBy(teams.id, teams.name, teams.conference, teams.classification, teams.apiTeamId);
    
    const diagnostics: TeamDiagnostic[] = [];
    
    for (const team of teamsWithGames) {
      // Count total games played
      const totalGames = await db.select({ count: sql<number>`COUNT(*)` })
        .from(games)
        .where(and(
          eq(games.season, season),
          sql`(${games.homeTeamId} = ${team.teamId} OR ${games.awayTeamId} = ${team.teamId})`,
          eq(games.isFinal, true)
        ));
      
      // Count FBS games (games against teams with FBS classification)
      const fbsGames = await db.select({ count: sql<number>`COUNT(*)` })
        .from(games)
        .innerJoin(teams, sql`${teams.id} = CASE 
          WHEN ${games.homeTeamId} = ${team.teamId} THEN ${games.awayTeamId}
          ELSE ${games.homeTeamId}
        END`)
        .where(and(
          eq(games.season, season),
          sql`(${games.homeTeamId} = ${team.teamId} OR ${games.awayTeamId} = ${team.teamId})`,
          eq(games.isFinal, true),
          sql`(${teams.classification} = 'fbs' OR ${teams.classification} IS NULL)`
        ));
      
      // Check if team has efficiency ratings
      const efficiencyRating = await db.query.teamEfficiencyRatings.findFirst({
        where: and(
          eq(teamEfficiencyRatings.teamId, team.teamId),
          eq(teamEfficiencyRatings.season, season)
        )
      });
      
      // Check if team has box score stats
      const boxScoreStats = await db.select({ count: sql<number>`COUNT(*)` })
        .from(gameBoxScoreStats)
        .innerJoin(games, eq(gameBoxScoreStats.gameId, games.id))
        .where(and(
          eq(gameBoxScoreStats.teamId, team.teamId),
          eq(games.season, season),
          eq(games.isFinal, true)
        ));
      
      const gamesPlayed = totalGames[0]?.count || 0;
      const fbsGamesPlayed = fbsGames[0]?.count || 0;
      const hasEfficiencyRatings = !!efficiencyRating;
      const hasBoxScoreStats = (boxScoreStats[0]?.count || 0) > 0;
      
      // Determine missing data reasons
      const missingDataReasons: string[] = [];
      
      if (gamesPlayed === 0) {
        missingDataReasons.push('No completed games found');
      } else if (fbsGamesPlayed === 0) {
        missingDataReasons.push('No games against FBS opponents');
      }
      
      if (!hasBoxScoreStats && gamesPlayed > 0) {
        missingDataReasons.push('Missing box score statistics');
      }
      
      if (!hasEfficiencyRatings && gamesPlayed > 0) {
        missingDataReasons.push('Efficiency ratings not calculated');
      }
      
      if (!team.apiTeamId) {
        missingDataReasons.push('Missing API team ID');
      }
      
      // Determine data quality
      let dataQuality: 'Excellent' | 'Good' | 'Limited' | 'Insufficient';
      if (hasEfficiencyRatings && hasBoxScoreStats && gamesPlayed >= 4) {
        dataQuality = 'Excellent';
      } else if (hasEfficiencyRatings && gamesPlayed >= 2) {
        dataQuality = 'Good';
      } else if (gamesPlayed >= 1) {
        dataQuality = 'Limited';
      } else {
        dataQuality = 'Insufficient';
      }
      
      // Only include teams that should have ratings but don't
      if (!hasEfficiencyRatings && gamesPlayed > 0) {
        diagnostics.push({
          teamId: team.teamId,
          teamName: team.teamName,
          conference: team.conference,
          classification: team.classification,
          gamesPlayed,
          fbsGamesPlayed,
          hasEfficiencyRatings,
          hasBoxScoreStats,
          missingDataReasons,
          dataQuality
        });
      }
    }
    
    console.log(`[Diagnostic] Found ${diagnostics.length} teams missing efficiency ratings`);
    return diagnostics;
  }
  
  /**
   * Generates a comprehensive season diagnostic report
   */
  async generateSeasonDiagnostic(season: number): Promise<SeasonDiagnostic> {
    console.log(`[Diagnostic] Generating comprehensive diagnostic for season ${season}...`);
    
    // Get total teams that played in this season
    const totalTeamsResult = await db.selectDistinct({ teamId: games.homeTeamId })
      .from(games)
      .where(eq(games.season, season));
    
    const totalTeams = totalTeamsResult.length;
    
    // Get teams with completed games
    const teamsWithGamesResult = await db.selectDistinct({ teamId: games.homeTeamId })
      .from(games)
      .where(and(eq(games.season, season), eq(games.isFinal, true)));
    
    const teamsWithGames = teamsWithGamesResult.length;
    
    // Get teams with efficiency ratings
    const teamsWithRatingsResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(teamEfficiencyRatings)
      .where(eq(teamEfficiencyRatings.season, season));
    
    const teamsWithRatings = teamsWithRatingsResult[0]?.count || 0;
    
    // Get detailed diagnostics for teams without ratings
    const teamsWithoutRatings = await this.diagnoseTeamEfficiencyRatings(season);
    
    // Calculate data completeness
    const dataCompleteness = teamsWithGames > 0 ? (teamsWithRatings / teamsWithGames) * 100 : 0;
    
    // Identify common issues
    const commonIssues: string[] = [];
    const issueFrequency = new Map<string, number>();
    
    for (const team of teamsWithoutRatings) {
      for (const reason of team.missingDataReasons) {
        const count = issueFrequency.get(reason) || 0;
        issueFrequency.set(reason, count + 1);
      }
    }
    
    // Sort issues by frequency
    const sortedIssues = Array.from(issueFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    for (const [issue, count] of sortedIssues) {
      commonIssues.push(`${issue} (${count} teams)`);
    }
    
    // Generate recommendations
    const recommendations: string[] = [];
    
    if (dataCompleteness < 50) {
      recommendations.push('Critical: Less than 50% of teams have efficiency ratings');
    }
    
    if (issueFrequency.get('Missing box score statistics') || 0 > 5) {
      recommendations.push('Run data ingestion to fetch missing box score statistics');
    }
    
    if (issueFrequency.get('Efficiency ratings not calculated') || 0 > 5) {
      recommendations.push('Run statistical processing to calculate efficiency ratings');
    }
    
    if (issueFrequency.get('Missing API team ID') || 0 > 0) {
      recommendations.push('Run team synchronization to update API team IDs');
    }
    
    return {
      season,
      totalTeams,
      teamsWithGames,
      teamsWithRatings,
      teamsWithoutRatings,
      dataCompleteness,
      commonIssues,
      recommendations
    };
  }
  
  /**
   * Generates a system-wide health report
   */
  async generateSystemHealthReport(): Promise<SystemHealthReport> {
    console.log('[Diagnostic] Generating system health report...');
    
    const currentYear = new Date().getFullYear();
    const seasons = [currentYear, currentYear - 1];
    
    const seasonDiagnostics: SeasonDiagnostic[] = [];
    const criticalIssues: string[] = [];
    
    for (const season of seasons) {
      try {
        const diagnostic = await this.generateSeasonDiagnostic(season);
        seasonDiagnostics.push(diagnostic);
        
        // Check for critical issues
        if (diagnostic.dataCompleteness < 30) {
          criticalIssues.push(`Season ${season}: Data completeness critically low (${diagnostic.dataCompleteness.toFixed(1)}%)`);
        }
        
        if (diagnostic.teamsWithoutRatings.length > diagnostic.teamsWithGames * 0.5) {
          criticalIssues.push(`Season ${season}: More than 50% of teams missing efficiency ratings`);
        }
        
      } catch (error) {
        criticalIssues.push(`Failed to analyze season ${season}: ${error}`);
      }
    }
    
    // Determine overall health
    let overallHealth: 'Healthy' | 'Warning' | 'Critical';
    if (criticalIssues.length > 0) {
      overallHealth = 'Critical';
    } else if (seasonDiagnostics.some(s => s.dataCompleteness < 70)) {
      overallHealth = 'Warning';
    } else {
      overallHealth = 'Healthy';
    }
    
    // Calculate performance metrics (simplified for now)
    const performanceMetrics = {
      avgProcessingTime: 0, // Would need to track this from actual operations
      errorRate: 0, // Would need to track this from logs
      dataFreshness: 0 // Would need to check last update timestamps
    };
    
    return {
      overallHealth,
      lastUpdated: new Date(),
      seasons: seasonDiagnostics,
      criticalIssues,
      performanceMetrics
    };
  }
  
  /**
   * Provides specific recommendations for fixing identified issues
   */
  async getFixRecommendations(season: number): Promise<{
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  }> {
    const diagnostic = await this.generateSeasonDiagnostic(season);
    
    const immediate: string[] = [];
    const shortTerm: string[] = [];
    const longTerm: string[] = [];
    
    // Immediate fixes (can be done right now)
    if (diagnostic.commonIssues.some(issue => issue.includes('Missing box score statistics'))) {
      immediate.push('Run "Update Recent Data" to fetch missing game statistics');
    }
    
    if (diagnostic.commonIssues.some(issue => issue.includes('Efficiency ratings not calculated'))) {
      immediate.push('Run "Recalculate Statistics" to generate efficiency ratings');
    }
    
    // Short-term fixes (require some investigation)
    if (diagnostic.commonIssues.some(issue => issue.includes('Missing API team ID'))) {
      shortTerm.push('Investigate teams without API IDs and update team synchronization');
    }
    
    if (diagnostic.dataCompleteness < 70) {
      shortTerm.push('Review data ingestion process for completeness issues');
    }
    
    // Long-term improvements
    if (diagnostic.teamsWithoutRatings.length > 10) {
      longTerm.push('Implement automated monitoring to detect missing ratings');
      longTerm.push('Add data quality checks to prevent future rating gaps');
    }
    
    return { immediate, shortTerm, longTerm };
  }
}

// Export singleton instance
export const diagnosticService = new DiagnosticService();