import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import StatCompareRow from '@/components/StatCompareRow';
import EfficiencyComparisonSection from '@/components/EfficiencyComparisonSection';
import HistoricalPerformanceTab from '@/components/HistoricalPerformanceTab';
import type { GameWithTeams, TeamHeadlineStats } from '@college-pickem/shared';

// Efficiency analysis types
interface EfficiencyComparison {
  category: 'passOffense' | 'rushOffense' | 'passDefense' | 'rushDefense' | 'scoring' | 'turnovers' | 'specialTeams';
  homeValue: number;
  awayValue: number;
  advantage: 'home' | 'away' | 'neutral';
  advantageMargin: number;
  description: string;
  impactLevel: 'high' | 'medium' | 'low';
}

interface DataQualityAssessment {
  homeGamesPlayed: number;
  awayGamesPlayed: number;
  homeTeamQuality: string;
  awayTeamQuality: string;
}

interface EfficiencyAnalysis {
  efficiencyComparisons: EfficiencyComparison[];
  dataQualityAssessment: DataQualityAssessment;
}

interface StatisticalDeepDiveCardProps {
  game: GameWithTeams;
  headlineStats?: { home: TeamHeadlineStats; away: TeamHeadlineStats };
  efficiencyAnalysis?: EfficiencyAnalysis;
  season: number;
}

const StatisticalDeepDiveCard: React.FC<StatisticalDeepDiveCardProps> = ({
  game,
  headlineStats,
  efficiencyAnalysis,
  season
}) => {
  const [activeTab, setActiveTab] = useState<string>('averages');

  return (
    <Card className="lg:col-span-2 transition-shadow hover:shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl font-bold">Statistical Deep Dive</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList 
            className="grid w-full grid-cols-3 mb-6" 
            role="tablist"
            aria-label="Statistical analysis tabs"
          >
            <TabsTrigger 
              value="averages"
              className="transition-all data-[state=active]:shadow-sm"
              role="tab"
              aria-controls="averages-panel"
              aria-selected={activeTab === 'averages'}
            >
              <span className="hidden sm:inline">Season Averages</span>
              <span className="sm:hidden">Averages</span>
            </TabsTrigger>
            <TabsTrigger 
              value="efficiency"
              className="transition-all data-[state=active]:shadow-sm"
              role="tab"
              aria-controls="efficiency-panel"
              aria-selected={activeTab === 'efficiency'}
            >
              <span className="hidden sm:inline">Efficiency Ratings</span>
              <span className="sm:hidden">Efficiency</span>
            </TabsTrigger>
            <TabsTrigger 
              value="historical"
              className="transition-all data-[state=active]:shadow-sm"
              role="tab"
              aria-controls="historical-panel"
              aria-selected={activeTab === 'historical'}
            >
              <span className="hidden sm:inline">Historical Analysis</span>
              <span className="sm:hidden">Historical</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Season Averages */}
          <TabsContent 
            value="averages" 
            className="space-y-2 mt-4 animate-in fade-in-50 duration-200"
            role="tabpanel"
            id="averages-panel"
            aria-labelledby="averages-tab"
          >
            {headlineStats ? (
              <>
                <StatCompareRow
                  label="Points / Game"
                  awayValue={headlineStats.away.pointsPerGame}
                  homeValue={headlineStats.home.pointsPerGame}
                  awayTeam={game.awayTeam}
                  homeTeam={game.homeTeam}
                />
                <StatCompareRow
                  label="Pts Allowed / Game"
                  awayValue={headlineStats.away.pointsAllowedPerGame}
                  homeValue={headlineStats.home.pointsAllowedPerGame}
                  awayTeam={game.awayTeam}
                  homeTeam={game.homeTeam}
                  lowerIsBetter
                />
                <StatCompareRow
                  label="Pass Yds / Game"
                  awayValue={headlineStats.away.passYardsPerGame}
                  homeValue={headlineStats.home.passYardsPerGame}
                  awayTeam={game.awayTeam}
                  homeTeam={game.homeTeam}
                />
                <StatCompareRow
                  label="Rush Yds / Game"
                  awayValue={headlineStats.away.rushYardsPerGame}
                  homeValue={headlineStats.home.rushYardsPerGame}
                  awayTeam={game.awayTeam}
                  homeTeam={game.homeTeam}
                />
                <StatCompareRow
                  label="Pass Yds Allowed / Game"
                  awayValue={headlineStats.away.passYardsAllowedPerGame}
                  homeValue={headlineStats.home.passYardsAllowedPerGame}
                  awayTeam={game.awayTeam}
                  homeTeam={game.homeTeam}
                  lowerIsBetter
                />
                <StatCompareRow
                  label="Rush Yds Allowed / Game"
                  awayValue={headlineStats.away.rushYardsAllowedPerGame}
                  homeValue={headlineStats.home.rushYardsAllowedPerGame}
                  awayTeam={game.awayTeam}
                  homeTeam={game.homeTeam}
                  lowerIsBetter
                />
                <StatCompareRow
                  label="TO Lost / Game"
                  awayValue={headlineStats.away.turnoversLostPerGame}
                  homeValue={headlineStats.home.turnoversLostPerGame}
                  awayTeam={game.awayTeam}
                  homeTeam={game.homeTeam}
                  lowerIsBetter
                />
                <StatCompareRow
                  label="TO Gained / Game"
                  awayValue={headlineStats.away.turnoversGainedPerGame}
                  homeValue={headlineStats.home.turnoversGainedPerGame}
                  awayTeam={game.awayTeam}
                  homeTeam={game.homeTeam}
                />
                <StatCompareRow
                  label="Sacks / Game"
                  awayValue={headlineStats.away.sacksPerGame}
                  homeValue={headlineStats.home.sacksPerGame}
                  awayTeam={game.awayTeam}
                  homeTeam={game.homeTeam}
                />
                <StatCompareRow
                  label="FGM / ATT / Game"
                  awayValue={`${headlineStats.away.fgMadePerGame}/${headlineStats.away.fgAttPerGame}`}
                  homeValue={`${headlineStats.home.fgMadePerGame}/${headlineStats.home.fgAttPerGame}`}
                  awayTeam={game.awayTeam}
                  homeTeam={game.homeTeam}
                  valueFormatter={(v) => String(v)}
                />
              </>
            ) : (
              <div className="text-center py-12 text-gray-500" role="status" aria-live="polite">
                <p className="text-lg">Season averages not available</p>
                <p className="text-sm mt-2">Data will appear once games are completed</p>
              </div>
            )}
          </TabsContent>

          {/* Tab 2: Efficiency Ratings */}
          <TabsContent 
            value="efficiency" 
            className="mt-4 animate-in fade-in-50 duration-200"
            role="tabpanel"
            id="efficiency-panel"
            aria-labelledby="efficiency-tab"
          >
            {efficiencyAnalysis ? (
              <div className="-mx-6 -mb-6">
                <EfficiencyComparisonSection
                  homeTeam={game.homeTeam}
                  awayTeam={game.awayTeam}
                  comparisons={efficiencyAnalysis.efficiencyComparisons}
                  dataQuality={{
                    homeTeamGames: efficiencyAnalysis.dataQualityAssessment.homeGamesPlayed,
                    awayTeamGames: efficiencyAnalysis.dataQualityAssessment.awayGamesPlayed,
                    homeDataQuality: efficiencyAnalysis.dataQualityAssessment.homeTeamQuality,
                    awayDataQuality: efficiencyAnalysis.dataQualityAssessment.awayTeamQuality,
                  }}
                />
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500" role="status" aria-live="polite">
                <p className="text-lg">Efficiency ratings not available</p>
                <p className="text-sm mt-2">Data will appear once sufficient games are completed</p>
              </div>
            )}
          </TabsContent>

          {/* Tab 3: Historical Analysis */}
          <TabsContent 
            value="historical" 
            className="mt-4 animate-in fade-in-50 duration-200"
            role="tabpanel"
            id="historical-panel"
            aria-labelledby="historical-tab"
          >
            <HistoricalPerformanceTab
              homeTeam={game.homeTeam}
              awayTeam={game.awayTeam}
              season={season}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default StatisticalDeepDiveCard;
