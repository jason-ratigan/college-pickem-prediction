import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TeamSelect, StatCategory, StatComparisonResponse } from '@college-pickem/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import StatComparisonTable from './StatComparisonTable';

interface HistoricalPerformanceTabProps {
  homeTeam: TeamSelect;
  awayTeam: TeamSelect;
  season: number;
}

// Statistical categories with display names
const STAT_CATEGORIES: Array<{ value: StatCategory; label: string }> = [
  { value: 'passingOffense', label: 'Passing Offense' },
  { value: 'rushingOffense', label: 'Rushing Offense' },
  { value: 'totalOffense', label: 'Total Offense' },
  { value: 'scoringOffense', label: 'Scoring Offense' },
  { value: 'thirdDownConversion', label: 'Third Down Conversion' },
  { value: 'redZoneEfficiency', label: 'Red Zone Efficiency' },
  { value: 'passingDefense', label: 'Passing Defense' },
  { value: 'rushingDefense', label: 'Rushing Defense' },
  { value: 'totalDefense', label: 'Total Defense' },
  { value: 'scoringDefense', label: 'Scoring Defense' },
  { value: 'thirdDownDefense', label: 'Third Down Defense' },
  { value: 'redZoneDefense', label: 'Red Zone Defense' },
];

// Fetch team stat comparison data
const fetchStatComparison = async (
  teamId: number,
  season: number,
  statCategory: StatCategory
): Promise<StatComparisonResponse> => {
  const res = await fetch(
    `/api/v1/teams/${teamId}/stat-comparison/${season}?statCategory=${statCategory}`
  );
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || 'Failed to fetch stat comparison data');
  }
  return res.json();
};

// Fetch all teams for search functionality
const fetchAllTeams = async (): Promise<TeamSelect[]> => {
  const res = await fetch('/api/v1/teams');
  if (!res.ok) throw new Error('Failed to fetch teams');
  return res.json();
};

const HistoricalPerformanceTab: React.FC<HistoricalPerformanceTabProps> = ({
  homeTeam,
  awayTeam,
  season,
}) => {
  // State for selections
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(homeTeam.id);
  const [selectedStatCategory, setSelectedStatCategory] = useState<StatCategory | null>(null);

  // Fetch all teams for the dropdown
  const { data: allTeams, isLoading: isLoadingTeams } = useQuery({
    queryKey: ['teams'],
    queryFn: fetchAllTeams,
  });

  // Fetch stat comparison data when both selections are made
  const {
    data: comparisonData,
    isLoading: isLoadingComparison,
    error: comparisonError,
  } = useQuery({
    queryKey: ['statComparison', selectedTeamId, season, selectedStatCategory],
    queryFn: () =>
      fetchStatComparison(selectedTeamId!, season, selectedStatCategory!),
    enabled: selectedTeamId !== null && selectedStatCategory !== null,
  });

  // Get the selected team object
  const selectedTeam = allTeams?.find((team) => team.id === selectedTeamId);

  // Sort teams: game teams first, then alphabetically
  const sortedTeams = React.useMemo(() => {
    if (!allTeams) return [];
    
    const gameTeamIds = [homeTeam.id, awayTeam.id];
    const gameTeams = allTeams.filter((team) => gameTeamIds.includes(team.id));
    const otherTeams = allTeams
      .filter((team) => !gameTeamIds.includes(team.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    return [...gameTeams, ...otherTeams];
  }, [allTeams, homeTeam.id, awayTeam.id]);

  return (
    <div className="space-y-6">
      {/* Selection Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        {/* Team Selector */}
        <div className="space-y-2">
          <Label htmlFor="team-select" className="text-sm font-semibold text-gray-700">
            Select Team
          </Label>
          {isLoadingTeams ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select
              value={selectedTeamId?.toString() || ''}
              onValueChange={(value) => setSelectedTeamId(parseInt(value, 10))}
            >
              <SelectTrigger 
                id="team-select"
                className="transition-all hover:border-gray-400 focus:ring-2 focus:ring-blue-500"
                aria-label="Select team for analysis"
              >
                <SelectValue placeholder="Choose a team..." />
              </SelectTrigger>
              <SelectContent>
                {sortedTeams.map((team, index) => (
                  <SelectItem 
                    key={team.id} 
                    value={team.id.toString()}
                    className="cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    {team.name}
                    {index < 2 && ' ⭐'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Stat Category Selector */}
        <div className="space-y-2">
          <Label htmlFor="stat-select" className="text-sm font-semibold text-gray-700">
            Select Statistical Category
          </Label>
          <Select
            value={selectedStatCategory || ''}
            onValueChange={(value) => setSelectedStatCategory(value as StatCategory)}
          >
            <SelectTrigger 
              id="stat-select"
              className="transition-all hover:border-gray-400 focus:ring-2 focus:ring-blue-500"
              aria-label="Select statistical category for analysis"
            >
              <SelectValue placeholder="Choose a stat category..." />
            </SelectTrigger>
            <SelectContent>
              {STAT_CATEGORIES.map((category) => (
                <SelectItem 
                  key={category.value} 
                  value={category.value}
                  className="cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-[300px]">
        {/* Loading State */}
        {isLoadingComparison && (
          <div className="space-y-4 animate-pulse" role="status" aria-live="polite" aria-label="Loading comparison data">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-64 w-full" />
            <span className="sr-only">Loading comparison data...</span>
          </div>
        )}

        {/* Error State */}
        {comparisonError && (
          <Alert variant="destructive" className="animate-in fade-in-50 duration-200">
            <AlertDescription role="alert">
              {comparisonError instanceof Error
                ? comparisonError.message
                : 'Failed to load stat comparison data'}
            </AlertDescription>
          </Alert>
        )}

        {/* No Data State */}
        {!isLoadingComparison &&
          !comparisonError &&
          comparisonData &&
          comparisonData.games.length === 0 && (
            <Alert className="animate-in fade-in-50 duration-200">
              <AlertDescription role="status">
                No completed games found for {selectedTeam?.name} in the {season} season.
              </AlertDescription>
            </Alert>
          )}

        {/* Data Display */}
        {!isLoadingComparison &&
          !comparisonError &&
          comparisonData &&
          comparisonData.games.length > 0 && (
            <div className="animate-in fade-in-50 duration-300">
              <StatComparisonTable
                comparisonData={comparisonData.games}
                summary={comparisonData.summary}
                teamName={comparisonData.teamName}
                statCategory={comparisonData.statCategory}
              />
            </div>
          )}

        {/* Placeholder State */}
        {!selectedTeamId && !selectedStatCategory && (
          <div className="text-center py-16 text-gray-500" role="status" aria-live="polite">
            <svg 
              className="mx-auto h-12 w-12 text-gray-400 mb-4" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-lg font-medium">Select a team and statistical category</p>
            <p className="text-sm mt-2">View historical performance analysis across the season</p>
          </div>
        )}

        {selectedTeamId && !selectedStatCategory && (
          <div className="text-center py-16 text-gray-500" role="status" aria-live="polite">
            <svg 
              className="mx-auto h-12 w-12 text-gray-400 mb-4" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-lg font-medium">Select a statistical category</p>
            <p className="text-sm mt-2">Choose which stat to analyze for {selectedTeam?.name}</p>
          </div>
        )}

        {!selectedTeamId && selectedStatCategory && (
          <div className="text-center py-16 text-gray-500" role="status" aria-live="polite">
            <svg 
              className="mx-auto h-12 w-12 text-gray-400 mb-4" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-lg font-medium">Select a team</p>
            <p className="text-sm mt-2">Choose which team to analyze</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoricalPerformanceTab;
