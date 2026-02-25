// server/services/dataQualityService.ts

import { db } from '../db.js';
import { teams, games, teamEfficiencyRatings, gameBoxScoreStats, statisticalProcessingLog } from '@college-pickem/shared';
import { eq, and, sql, desc, gte, isNull } from 'drizzle-orm';
import { diagnosticService } from './diagnosticService.js';

export interface DataQualityMetrics {
  season: number;
  totalTeams: number;
  teamsWithRatings: number;
  teamsWithoutRatings: number;
  dataCompletenessRatio: number;
  gamesWithStats: number;
  gamesWithoutStats: number;
  lastProcessingDate: Date | null;
  qualityScore: number; // 0-100
  issues: DataQualityIssue[];
}

export interface DataQualityIssue {
  severity: 'Critical' | 'Warning' | 'Info';
  category: 'Missing Data' | 'Data Integrity' | 'Processing' | 'Performance';
  description: string;
  affectedCount: number;
  recommendation: string;
}

export interface DataCompletenessReport {
  season: number;
  teamCompleteness: {
    total: number;
    withRatings: number;
    withoutRatings: number;
    percentage: number;
  };
  gameCompleteness: {
    total: number;
    withStats: number;
    withoutStats: number;
    percentage: number;
  };
  missingDataBreakdown: {
    category: string;
    count: number;
    percentage: number;
  }[];
}

export interface ProcessingHealthCheck {
  isHealthy: boolean;
  lastSuccessfulRun: Date | null;
  daysSinceLastRun: number;
  recentErrors: string[];
  processingTrends: {
    date: Date;
    teamsProcessed: number;
    errors: number;
    processingTime: number;
  }[];
}

export class DataQualityService {
  
  /**
   * Generates comprehensive data quality metrics for a season
   */
  async generateQualityMetrics(season: number): Promise<DataQualityMetrics> {
    console.log(`[Data Quality] Generating quality metrics for season ${season}...`);
    
    // Get total teams that played in this season
    const totalTeamsResult = await db.selectDistinct({ 
      teamId: sql<number>`CASE WHEN ${games.homeTeamId} IS NOT NULL THEN ${games.homeTeamId} ELSE ${games.awayTeamId} END`
    })
    .from(games)
    .where(eq(games.season, season));
    
    const totalTeams = totalTeamsResult.length;
    
    // Get teams with efficiency ratings
    const teamsWithRatingsResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(teamEfficiencyRatings)
      .where(eq(teamEfficiencyRatings.season, season));
    
    const teamsWithRatings = teamsWithRatingsResult[0]?.count || 0;
    const teamsWithoutRatings = totalTeams - teamsWithRatings;
    const dataCompletenessRatio = totalTeams > 0 ? teamsWithRatings / totalTeams : 0;
    
    // Get games with and without stats
    const totalGamesResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(games)
      .where(and(eq(games.season, season), eq(games.isFinal, true)));
    
    const totalGames = totalGamesResult[0]?.count || 0;
    
    const gamesWithStatsResult = await db.select({ 
      count: sql<number>`COUNT(DISTINCT ${gameBoxScoreStats.gameId})` 
    })
    .from(gameBoxScoreStats)
    .innerJoin(games, eq(gameBoxScoreStats.gameId, games.id))
    .where(and(eq(games.season, season), eq(games.isFinal, true)));
    
    const gamesWithStats = gamesWithStatsResult[0]?.count || 0;
    const gamesWithoutStats = totalGames - gamesWithStats;
    
    // Get last processing date
    const lastProcessingResult = await db.query.statisticalProcessingLog.findFirst({
      where: eq(statisticalProcessingLog.season, season),
      orderBy: desc(statisticalProcessingLog.endDate)
    });
    
    const lastProcessingDate = lastProcessingResult?.endDate || null;
    
    // Identify issues
    const issues: DataQualityIssue[] = [];
    
    // Critical issues
    if (dataCompletenessRatio < 0.5) {
      issues.push({
        severity: 'Critical',
        category: 'Missing Data',
        description: 'Less than 50% of teams have efficiency ratings',
        affectedCount: teamsWithoutRatings,
        recommendation: 'Run statistical processing immediately to calculate missing ratings'
      });
    }
    
    if (gamesWithoutStats > totalGames * 0.3) {
      issues.push({
        severity: 'Critical',
        category: 'Missing Data',
        description: 'More than 30% of games missing statistical data',
        affectedCount: gamesWithoutStats,
        recommendation: 'Run data ingestion to fetch missing game statistics'
      });
    }
    
    // Warning issues
    if (dataCompletenessRatio < 0.8) {
      issues.push({
        severity: 'Warning',
        category: 'Data Integrity',
        description: 'Some teams missing efficiency ratings',
        affectedCount: teamsWithoutRatings,
        recommendation: 'Review teams without ratings and ensure they have sufficient game data'
      });
    }
    
    if (lastProcessingDate && (Date.now() - lastProcessingDate.getTime()) > 7 * 24 * 60 * 60 * 1000) {
      issues.push({
        severity: 'Warning',
        category: 'Processing',
        description: 'Statistical processing has not run in over a week',
        affectedCount: 1,
        recommendation: 'Run recent data update and statistical processing'
      });
    }
    
    // Info issues
    if (teamsWithoutRatings > 0 && teamsWithoutRatings <= totalTeams * 0.1) {
      issues.push({
        severity: 'Info',
        category: 'Data Integrity',
        description: 'Small number of teams missing efficiency ratings',
        affectedCount: teamsWithoutRatings,
        recommendation: 'Monitor these teams for data availability'
      });
    }
    
    // Calculate overall quality score (0-100)
    let qualityScore = 100;
    
    // Deduct points for missing data
    qualityScore -= (1 - dataCompletenessRatio) * 40; // Up to 40 points for team completeness
    qualityScore -= (gamesWithoutStats / Math.max(totalGames, 1)) * 30; // Up to 30 points for game stats
    
    // Deduct points for processing delays
    if (lastProcessingDate) {
      const daysSinceProcessing = (Date.now() - lastProcessingDate.getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceProcessing > 7) {
        qualityScore -= Math.min(daysSinceProcessing - 7, 20); // Up to 20 points for processing delays
      }
    } else {
      qualityScore -= 30; // No processing history
    }
    
    // Deduct points for critical issues
    const criticalIssues = issues.filter(i => i.severity === 'Critical').length;
    qualityScore -= criticalIssues * 10;
    
    qualityScore = Math.max(0, Math.round(qualityScore));
    
    return {
      season,
      totalTeams,
      teamsWithRatings,
      teamsWithoutRatings,
      dataCompletenessRatio,
      gamesWithStats,
      gamesWithoutStats,
      lastProcessingDate,
      qualityScore,
      issues
    };
  }
  
  /**
   * Generates a detailed data completeness report
   */
  async generateCompletenessReport(season: number): Promise<DataCompletenessReport> {
    console.log(`[Data Quality] Generating completeness report for season ${season}...`);
    
    // Get team completeness data
    const totalTeamsResult = await db.selectDistinct({ 
      teamId: sql<number>`CASE WHEN ${games.homeTeamId} IS NOT NULL THEN ${games.homeTeamId} ELSE ${games.awayTeamId} END`
    })
    .from(games)
    .where(eq(games.season, season));
    
    const totalTeams = totalTeamsResult.length;
    
    const teamsWithRatingsResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(teamEfficiencyRatings)
      .where(eq(teamEfficiencyRatings.season, season));
    
    const teamsWithRatings = teamsWithRatingsResult[0]?.count || 0;
    const teamsWithoutRatings = totalTeams - teamsWithRatings;
    
    // Get game completeness data
    const totalGamesResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(games)
      .where(and(eq(games.season, season), eq(games.isFinal, true)));
    
    const totalGames = totalGamesResult[0]?.count || 0;
    
    const gamesWithStatsResult = await db.select({ 
      count: sql<number>`COUNT(DISTINCT ${gameBoxScoreStats.gameId})` 
    })
    .from(gameBoxScoreStats)
    .innerJoin(games, eq(gameBoxScoreStats.gameId, games.id))
    .where(and(eq(games.season, season), eq(games.isFinal, true)));
    
    const gamesWithStats = gamesWithStatsResult[0]?.count || 0;
    const gamesWithoutStats = totalGames - gamesWithStats;
    
    // Get detailed breakdown of missing data
    const diagnostics = await diagnosticService.diagnoseTeamEfficiencyRatings(season);
    
    const missingDataBreakdown = new Map<string, number>();
    for (const team of diagnostics) {
      for (const reason of team.missingDataReasons) {
        const count = missingDataBreakdown.get(reason) || 0;
        missingDataBreakdown.set(reason, count + 1);
      }
    }
    
    const missingDataArray = Array.from(missingDataBreakdown.entries())
      .map(([category, count]) => ({
        category,
        count,
        percentage: totalTeams > 0 ? (count / totalTeams) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
    
    return {
      season,
      teamCompleteness: {
        total: totalTeams,
        withRatings: teamsWithRatings,
        withoutRatings: teamsWithoutRatings,
        percentage: totalTeams > 0 ? (teamsWithRatings / totalTeams) * 100 : 0
      },
      gameCompleteness: {
        total: totalGames,
        withStats: gamesWithStats,
        withoutStats: gamesWithoutStats,
        percentage: totalGames > 0 ? (gamesWithStats / totalGames) * 100 : 0
      },
      missingDataBreakdown: missingDataArray
    };
  }
  
  /**
   * Checks the health of the statistical processing system
   */
  async checkProcessingHealth(): Promise<ProcessingHealthCheck> {
    console.log('[Data Quality] Checking processing system health...');
    
    // Get recent processing logs
    const recentLogs = await db.query.statisticalProcessingLog.findMany({
      orderBy: desc(statisticalProcessingLog.createdAt),
      limit: 10
    });
    
    // Find last successful run
    const lastSuccessfulRun = recentLogs.find(log => 
      log.endDate && log.teamsUpdated && log.teamsUpdated > 0
    )?.endDate || null;
    
    const daysSinceLastRun = lastSuccessfulRun 
      ? (Date.now() - lastSuccessfulRun.getTime()) / (24 * 60 * 60 * 1000)
      : 999;
    
    // Collect recent errors
    const recentErrors: string[] = [];
    for (const log of recentLogs.slice(0, 5)) {
      if (log.processingTime && log.processingTime < 1000) {
        recentErrors.push(`Processing completed too quickly (${log.processingTime}ms) - possible failure`);
      }
      if (log.teamsUpdated === 0) {
        recentErrors.push(`No teams updated in ${log.processType} process`);
      }
    }
    
    // Build processing trends
    const processingTrends = recentLogs
      .filter(log => log.endDate && log.processingTime)
      .map(log => ({
        date: log.endDate!,
        teamsProcessed: log.teamsUpdated || 0,
        errors: recentErrors.length, // Simplified - would need better error tracking
        processingTime: log.processingTime || 0
      }))
      .slice(0, 7); // Last 7 runs
    
    // Determine if system is healthy
    const isHealthy = daysSinceLastRun < 7 && recentErrors.length < 3;
    
    return {
      isHealthy,
      lastSuccessfulRun,
      daysSinceLastRun,
      recentErrors,
      processingTrends
    };
  }
  
  /**
   * Validates data consistency across related tables
   */
  async validateDataConsistency(season: number): Promise<{
    isConsistent: boolean;
    inconsistencies: string[];
    recommendations: string[];
  }> {
    console.log(`[Data Quality] Validating data consistency for season ${season}...`);
    
    const inconsistencies: string[] = [];
    const recommendations: string[] = [];
    
    // Check for games without teams
    const gamesWithoutTeams = await db.select({ count: sql<number>`COUNT(*)` })
      .from(games)
      .leftJoin(teams, sql`${teams.id} = ${games.homeTeamId}`)
      .where(and(
        eq(games.season, season),
        isNull(teams.id)
      ));
    
    if ((gamesWithoutTeams[0]?.count || 0) > 0) {
      inconsistencies.push(`${gamesWithoutTeams[0].count} games reference non-existent home teams`);
      recommendations.push('Run team synchronization to ensure all referenced teams exist');
    }
    
    // Check for efficiency ratings without corresponding teams
    const ratingsWithoutTeams = await db.select({ count: sql<number>`COUNT(*)` })
      .from(teamEfficiencyRatings)
      .leftJoin(teams, eq(teamEfficiencyRatings.teamId, teams.id))
      .where(and(
        eq(teamEfficiencyRatings.season, season),
        isNull(teams.id)
      ));
    
    if ((ratingsWithoutTeams[0]?.count || 0) > 0) {
      inconsistencies.push(`${ratingsWithoutTeams[0].count} efficiency ratings reference non-existent teams`);
      recommendations.push('Clean up orphaned efficiency ratings');
    }
    
    // Check for box score stats without corresponding games
    const statsWithoutGames = await db.select({ count: sql<number>`COUNT(*)` })
      .from(gameBoxScoreStats)
      .leftJoin(games, eq(gameBoxScoreStats.gameId, games.id))
      .where(and(
        eq(games.season, season),
        isNull(games.id)
      ));
    
    if ((statsWithoutGames[0]?.count || 0) > 0) {
      inconsistencies.push(`${statsWithoutGames[0].count} box score stats reference non-existent games`);
      recommendations.push('Clean up orphaned box score statistics');
    }
    
    const isConsistent = inconsistencies.length === 0;
    
    return {
      isConsistent,
      inconsistencies,
      recommendations
    };
  }
  
  /**
   * Monitors data quality continuously and returns alerts
   */
  async monitorDataQuality(season: number): Promise<{
    alerts: DataQualityIssue[];
    status: 'Good' | 'Warning' | 'Critical';
    nextCheckRecommended: Date;
  }> {
    const metrics = await this.generateQualityMetrics(season);
    const processingHealth = await this.checkProcessingHealth();
    const consistency = await this.validateDataConsistency(season);
    
    const alerts: DataQualityIssue[] = [...metrics.issues];
    
    // Add processing health alerts
    if (!processingHealth.isHealthy) {
      alerts.push({
        severity: 'Warning',
        category: 'Processing',
        description: 'Statistical processing system appears unhealthy',
        affectedCount: 1,
        recommendation: 'Check processing logs and run manual update if needed'
      });
    }
    
    // Add consistency alerts
    if (!consistency.isConsistent) {
      alerts.push({
        severity: 'Critical',
        category: 'Data Integrity',
        description: 'Data consistency issues detected',
        affectedCount: consistency.inconsistencies.length,
        recommendation: consistency.recommendations.join('; ')
      });
    }
    
    // Determine overall status
    let status: 'Good' | 'Warning' | 'Critical';
    const criticalAlerts = alerts.filter(a => a.severity === 'Critical').length;
    const warningAlerts = alerts.filter(a => a.severity === 'Warning').length;
    
    if (criticalAlerts > 0) {
      status = 'Critical';
    } else if (warningAlerts > 0) {
      status = 'Warning';
    } else {
      status = 'Good';
    }
    
    // Recommend next check time based on status
    const nextCheckHours = status === 'Critical' ? 1 : status === 'Warning' ? 6 : 24;
    const nextCheckRecommended = new Date(Date.now() + nextCheckHours * 60 * 60 * 1000);
    
    return {
      alerts,
      status,
      nextCheckRecommended
    };
  }
}

// Export singleton instance
export const dataQualityService = new DataQualityService();