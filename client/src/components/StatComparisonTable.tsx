import React from 'react';
import { StatComparisonData, StatComparisonSummary } from '@college-pickem/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface StatComparisonTableProps {
  comparisonData: StatComparisonData[];
  summary: StatComparisonSummary;
  teamName: string;
  statCategory: string;
}

const StatComparisonTable: React.FC<StatComparisonTableProps> = ({
  comparisonData,
  summary,
  teamName,
  statCategory,
}) => {
  // Format stat category for display
  const formatStatCategory = (category: string): string => {
    return category
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  // Format numbers with appropriate precision
  const formatNumber = (value: number): string => {
    return Number.isInteger(value) ? value.toString() : value.toFixed(1);
  };

  // Format percentage with sign
  const formatPercentage = (value: number): string => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  // Check if this is a defensive stat (lower is better)
  const isDefensiveStat = (category: string): boolean => {
    return category.toLowerCase().includes('defense');
  };

  const lowerIsBetter = isDefensiveStat(statCategory);

  // Determine if performance is above or below average
  const getPerformanceColor = (percentageDiff: number): string => {
    // For defensive stats, negative difference is good (held opponent below their average)
    // For offensive stats, positive difference is good (performed above opponent's average defense)
    const isGood = lowerIsBetter ? percentageDiff < 0 : percentageDiff > 0;
    const isBad = lowerIsBetter ? percentageDiff > 0 : percentageDiff < 0;
    
    if (isGood) {
      return 'text-green-600 font-semibold';
    } else if (isBad) {
      return 'text-red-600 font-semibold';
    }
    return 'text-gray-600';
  };

  // Get performance indicator icon
  const getPerformanceIndicator = (percentageDiff: number): string => {
    const isGood = lowerIsBetter ? percentageDiff < 0 : percentageDiff > 0;
    const isBad = lowerIsBetter ? percentageDiff > 0 : percentageDiff < 0;
    
    if (isGood) return '✓';
    if (isBad) return '✗';
    return '−';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2">
        <h3 className="text-lg font-bold text-gray-900">
          {teamName} - {formatStatCategory(statCategory)}
        </h3>
        <Badge 
          variant="outline" 
          className="w-fit transition-colors hover:bg-gray-100"
          aria-label={`${summary.gamesAboveAverage} out of ${comparisonData.length} games above average`}
        >
          {summary.gamesAboveAverage}/{comparisonData.length} games above avg
        </Badge>
      </div>

      <div className="rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 hover:bg-gray-50">
                <TableHead className="w-16 font-semibold text-gray-700">Week</TableHead>
                <TableHead className="font-semibold text-gray-700">Opponent</TableHead>
                <TableHead className="text-right font-semibold text-gray-700">Team</TableHead>
                <TableHead className="text-right font-semibold text-gray-700">
                  <span className="hidden sm:inline">Opp Avg</span>
                  <span className="sm:hidden">Avg</span>
                </TableHead>
                <TableHead className="text-right font-semibold text-gray-700">Diff</TableHead>
                <TableHead className="text-right font-semibold text-gray-700">
                  <span className="hidden sm:inline">% Diff</span>
                  <span className="sm:hidden">%</span>
                </TableHead>
                <TableHead className="w-12" aria-label="Performance indicator"></TableHead>
              </TableRow>
            </TableHeader>
          <TableBody>
            {comparisonData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-500 py-12" role="status">
                  <p className="text-lg">No game data available</p>
                </TableCell>
              </TableRow>
            ) : (
              comparisonData.map((game) => (
                <TableRow 
                  key={game.gameId}
                  className="transition-colors hover:bg-gray-50"
                >
                  <TableCell className="font-medium text-gray-900">{game.week}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {game.opponent.logoUrl && (
                        <img
                          src={game.opponent.logoUrl}
                          alt={`${game.opponent.name} logo`}
                          className="w-6 h-6 object-contain flex-shrink-0"
                        />
                      )}
                      <span className="hidden sm:inline truncate">{game.opponent.name}</span>
                      <span className="sm:hidden truncate">{game.opponent.name.split(' ').pop()}</span>
                      {!game.isHomeGame && (
                        <span 
                          className="text-xs text-gray-500 font-medium" 
                          aria-label="Away game"
                          title="Away game"
                        >
                          @
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-gray-900">
                    {formatNumber(game.teamPerformance)}
                  </TableCell>
                  <TableCell className="text-right text-gray-600">
                    {formatNumber(game.opponentSeasonAverage)}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${getPerformanceColor(game.percentageDifference)}`}>
                    {formatNumber(game.difference)}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${getPerformanceColor(game.percentageDifference)}`}>
                    {formatPercentage(game.percentageDifference)}
                  </TableCell>
                  <TableCell className="text-center">
                    <span 
                      className={`text-lg ${getPerformanceColor(game.percentageDifference)}`}
                      aria-label={
                        game.percentageDifference > 0 
                          ? 'Above average' 
                          : game.percentageDifference < 0 
                          ? 'Below average' 
                          : 'Average'
                      }
                    >
                      {getPerformanceIndicator(game.percentageDifference)}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {comparisonData.length > 0 && (
            <TableFooter>
              <TableRow className="bg-gray-100 hover:bg-gray-100 font-bold border-t-2 border-gray-300">
                <TableCell colSpan={2} className="text-gray-900">Season Summary</TableCell>
                <TableCell className="text-right text-gray-900">
                  {formatNumber(summary.averageTeamPerformance)}
                </TableCell>
                <TableCell className="text-right text-gray-900">
                  {formatNumber(summary.averageOpponentDefense)}
                </TableCell>
                <TableCell className={`text-right ${getPerformanceColor(
                  ((summary.averageTeamPerformance - summary.averageOpponentDefense) / 
                  summary.averageOpponentDefense) * 100
                )}`}>
                  {formatNumber(summary.overallDifference)}
                </TableCell>
                <TableCell className={`text-right ${getPerformanceColor(
                  ((summary.averageTeamPerformance - summary.averageOpponentDefense) / 
                  summary.averageOpponentDefense) * 100
                )}`}>
                  {formatPercentage(
                    ((summary.averageTeamPerformance - summary.averageOpponentDefense) / 
                    summary.averageOpponentDefense) * 100
                  )}
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
        </div>
      </div>

      {comparisonData.length > 0 && (
        <div 
          className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-700 space-y-2"
          role="region"
          aria-label="Performance summary"
        >
          <p className="leading-relaxed">
            <span className="font-semibold text-gray-900">{teamName}</span>{' '}
            {lowerIsBetter ? 'allowed' : 'averaged'}{' '}
            <span className="font-bold text-blue-700">{formatNumber(summary.averageTeamPerformance)}</span>{' '}
            in {formatStatCategory(statCategory).toLowerCase()}, compared to opponents' average of{' '}
            <span className="font-bold text-blue-700">{formatNumber(summary.averageOpponentDefense)}</span>.
          </p>
          <p className="leading-relaxed">
            <span className="font-medium">Performance:</span>{' '}
            <span className={`font-bold ${getPerformanceColor(
              ((summary.averageTeamPerformance - summary.averageOpponentDefense) / 
              summary.averageOpponentDefense) * 100
            )}`}>
              {formatNumber(summary.overallDifference)} (
              {formatPercentage(
                ((summary.averageTeamPerformance - summary.averageOpponentDefense) / 
                summary.averageOpponentDefense) * 100
              )})
            </span>{' '}
            {lowerIsBetter 
              ? summary.overallDifference < 0 
                ? 'better than opponent averages (held them below their typical performance)' 
                : 'worse than opponent averages (allowed more than their typical performance)'
              : summary.overallDifference > 0
                ? 'better than opponent averages'
                : 'worse than opponent averages'
            }
          </p>
        </div>
      )}
    </div>
  );
};

export default StatComparisonTable;
