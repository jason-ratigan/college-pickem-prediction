import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { InfoIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { getShortName } from '@/utils/team-helpers'; // EDIT 1: Import helper

// Types based on the design document and existing interfaces
interface TeamInfo {
  id: number;
  name: string;
  logoUrl: string | null;
  abbreviation?: string | null; // EDIT 2: Add abbreviation to type
}

interface EfficiencyComparison {
  category: 'passOffense' | 'rushOffense' | 'passDefense' | 'rushDefense' | 'scoring' | 'turnovers' | 'specialTeams';
  homeValue: number;
  awayValue: number;
  advantage: 'home' | 'away' | 'neutral';
  advantageMargin: number;
  description: string;
  impactLevel: 'high' | 'medium' | 'low';
}

interface DataQualityInfo {
  homeTeamGames: number;
  awayTeamGames: number;
  homeDataQuality: string;
  awayDataQuality: string;
}

interface EfficiencyComparisonSectionProps {
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  comparisons: EfficiencyComparison[];
  dataQuality: DataQualityInfo;
  isLoading?: boolean;
}

// Efficiency metric display component
interface EfficiencyMetricProps {
  label: string;
  homeValue: number;
  awayValue: number;
  advantage: 'home' | 'away' | 'neutral';
  advantageMargin: number;
  description: string;
  impactLevel: 'high' | 'medium' | 'low';
  homeTeam: TeamInfo; // EDIT 3: Accept full team object
  awayTeam: TeamInfo; // EDIT 3: Accept full team object
  unit?: string;
}

const EfficiencyMetric: React.FC<EfficiencyMetricProps> = ({
  label,
  homeValue,
  awayValue,
  advantage,
  advantageMargin,
  description,
  impactLevel,
  homeTeam,
  awayTeam,
  unit = ''
}) => {
  // Normalize values for visual comparison (handle negative values properly)
  const normalizeValue = (value: number) => Math.max(0, value + 100) / 200; // Assumes efficiency range -100 to +100
  const homeNormalized = normalizeValue(homeValue);
  const awayNormalized = normalizeValue(awayValue);
  
  // Calculate bar widths based on relative values
  const maxNormalized = Math.max(homeNormalized, awayNormalized, 0.1); // Prevent division by zero
  const homeBarWidth = (homeNormalized / maxNormalized) * 45; // Max 45% to leave space for center
  const awayBarWidth = (awayNormalized / maxNormalized) * 45;
  
  // Determine colors based on advantage with better visual distinction
  const getValueColor = (isHome: boolean) => {
    if (advantage === 'neutral') return 'text-gray-700 font-medium';
    if ((advantage === 'home' && isHome) || (advantage === 'away' && !isHome)) {
      return 'text-green-700 font-bold';
    }
    return 'text-red-600 font-medium';
  };

  const getBarColor = (isHome: boolean) => {
    if (advantage === 'neutral') return 'bg-gray-400';
    if ((advantage === 'home' && isHome) || (advantage === 'away' && !isHome)) {
      return 'bg-green-500';
    }
    return 'bg-red-400';
  };

  const getImpactBadgeVariant = (impact: string) => {
    switch (impact) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'secondary';
    }
  };

  // Format values with appropriate precision
  const formatValue = (value: number) => {
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  };

  return (
    <TooltipProvider>
      <div className="space-y-3 p-4 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-800">{label}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
                  <InfoIcon className="h-4 w-4 text-gray-400 hover:text-gray-600 transition-colors" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-sm">{description}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Badge variant={getImpactBadgeVariant(impactLevel)} className="text-xs">
            {impactLevel} impact
          </Badge>
        </div>

        {/* Team values and visual comparison */}
        <div className="space-y-3">
          {/* Numerical values */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="w-12 text-right text-gray-600 text-xs font-medium">
                {getShortName(awayTeam)} 
              </span>
              <span className={`${getValueColor(false)} min-w-[4rem] text-center`}>
                {formatValue(awayValue)}{unit}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className={`${getValueColor(true)} min-w-[4rem] text-center`}>
                {formatValue(homeValue)}{unit}
              </span>
              <span className="w-12 text-left text-gray-600 text-xs font-medium">
                {getShortName(homeTeam)}
              </span>
            </div>
          </div>

          {/* Visual comparison bar */}
          <div className="relative h-6 bg-gray-200 rounded-full overflow-hidden">
            {/* Away team bar (left side) */}
            <div 
              className={`absolute left-0 top-0 h-full ${getBarColor(false)} transition-all duration-300 ease-out`}
              style={{ width: `${awayBarWidth}%` }}
            />
            {/* Home team bar (right side) */}
            <div 
              className={`absolute right-0 top-0 h-full ${getBarColor(true)} transition-all duration-300 ease-out`}
              style={{ width: `${homeBarWidth}%` }}
            />
            {/* Center divider line */}
            <div className="absolute top-0 left-1/2 w-0.5 h-full bg-gray-600 transform -translate-x-0.5" />
            
            {/* Advantage indicator */}
            {advantage !== 'neutral' && (
              <div className={`absolute top-1/2 transform -translate-y-1/2 text-white text-xs font-bold px-1 ${
                advantage === 'home' ? 'right-2' : 'left-2'
              }`}>
                +{formatValue(advantageMargin)}
              </div>
            )}
          </div>

          {/* Advantage description */}
          {advantage !== 'neutral' && (
            <div className="text-center">
              <span className={`text-xs px-2 py-1 rounded-full ${
                advantage === 'home' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {getShortName(advantage === 'home' ? homeTeam : awayTeam)} 
                {' '}advantage: +{formatValue(advantageMargin)}{unit}
              </span>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

// Main component
const EfficiencyComparisonSection: React.FC<EfficiencyComparisonSectionProps> = ({
  homeTeam,
  awayTeam,
  comparisons,
  dataQuality,
  isLoading = false
}) => {
  const [showExplanation, setShowExplanation] = React.useState(false);
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team Efficiency Comparison</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Group comparisons by category type
  const offenseComparisons = comparisons.filter(c => 
    c.category === 'passOffense' || c.category === 'rushOffense' || c.category === 'scoring'
  );
  
  const defenseComparisons = comparisons.filter(c => 
    c.category === 'passDefense' || c.category === 'rushDefense'
  );
  
  const specialComparisons = comparisons.filter(c => 
    c.category === 'turnovers' || c.category === 'specialTeams'
  );

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      passOffense: 'Pass Offense',
      rushOffense: 'Rush Offense', 
      scoring: 'Scoring Efficiency',
      passDefense: 'Pass Defense',
      rushDefense: 'Rush Defense',
      turnovers: 'Turnover Margin',
      specialTeams: 'Special Teams'
    };
    return labels[category] || category;
  };

  const getCategoryDescription = (categoryType: string) => {
    const descriptions: Record<string, string> = {
      offense: 'Measures how effectively each team moves the ball and scores points compared to average teams.',
      defense: 'Evaluates how well each team prevents opponents from gaining yards and scoring points.',
      special: 'Analyzes turnover rates, field position, and special teams performance impact on game outcomes.'
    };
    return descriptions[categoryType] || '';
  };

  const getDetailedMetricExplanation = (category: string) => {
    const explanations: Record<string, string> = {
      passOffense: 'Measures passing yards per attempt, completion percentage, and touchdown rate compared to opponents faced. Higher values indicate more effective passing attacks.',
      rushOffense: 'Evaluates rushing yards per carry, explosive play rate, and red zone efficiency. Accounts for strength of opposing run defenses.',
      scoring: 'Combines red zone efficiency, field goal success rate, and points per drive. Adjusted for field position and opponent defensive strength.',
      passDefense: 'Measures yards per attempt allowed, interception rate, and pressure generated. Lower values indicate better pass defense.',
      rushDefense: 'Evaluates rushing yards per carry allowed, tackles for loss, and goal line stands. Adjusted for opponent offensive strength.',
      turnovers: 'Net turnover margin accounting for fumble recovery rates and interception percentages. Positive values favor this team.',
      specialTeams: 'Combines field goal accuracy, punt/kickoff coverage, return efficiency, and field position impact on scoring.'
    };
    return explanations[category] || 'Efficiency metric comparing team performance to national averages.';
  };

  const renderEfficiencyCategory = (title: string, categoryComparisons: EfficiencyComparison[], categoryType: string) => {
    if (categoryComparisons.length === 0) return null;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-lg text-gray-800">{title}</h4>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
                  <InfoIcon className="h-4 w-4 text-gray-400 hover:text-gray-600 transition-colors" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">
                <p className="text-sm">{getCategoryDescription(categoryType)}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="space-y-3">
          {categoryComparisons.map((comparison) => (
            <EfficiencyMetric
              key={comparison.category}
              label={getCategoryLabel(comparison.category)}
              homeValue={comparison.homeValue}
              awayValue={comparison.awayValue}
              advantage={comparison.advantage}
              advantageMargin={comparison.advantageMargin}
              description={getDetailedMetricExplanation(comparison.category)}
              impactLevel={comparison.impactLevel}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Team Efficiency Comparison</CardTitle>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Data Quality:</span>
            <Badge variant="outline">
              {getShortName(awayTeam)}: {dataQuality.awayTeamGames} games
            </Badge>
            <Badge variant="outline">
              {getShortName(homeTeam)}: {dataQuality.homeTeamGames} games
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Data quality warning if insufficient */}
        {(dataQuality.homeTeamGames < 4 || dataQuality.awayTeamGames < 4) && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Limited Data:</strong> Some efficiency metrics may be less reliable due to small sample sizes.
            </p>
          </div>
        )}

        {/* Offense Section */}
        {renderEfficiencyCategory('Offensive Efficiency', offenseComparisons, 'offense')}
        
        {offenseComparisons.length > 0 && defenseComparisons.length > 0 && <Separator />}
        
        {/* Defense Section */}
        {renderEfficiencyCategory('Defensive Efficiency', defenseComparisons, 'defense')}
        
        {(offenseComparisons.length > 0 || defenseComparisons.length > 0) && specialComparisons.length > 0 && <Separator />}
        
        {/* Special Teams & Turnovers Section */}
        {renderEfficiencyCategory('Special Situations', specialComparisons, 'special')}

        {/* Progressive disclosure for detailed explanations */}
        {comparisons.length > 0 && (
          <Collapsible open={showExplanation} onOpenChange={setShowExplanation}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between text-sm text-gray-600 hover:text-gray-800">
                <span>How are efficiency ratings calculated?</span>
                {showExplanation ? (
                  <ChevronUpIcon className="h-4 w-4" />
                ) : (
                  <ChevronDownIcon className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                <h5 className="font-semibold text-blue-900 mb-2">Understanding Efficiency Metrics</h5>
                <div className="space-y-2 text-blue-800">
                  <p>
                    <strong>Efficiency ratings</strong> measure how well teams perform relative to the average college football team. 
                    Positive values indicate above-average performance, while negative values indicate below-average performance.
                  </p>
                  <p>
                    <strong>Impact levels</strong> are determined by the magnitude of the efficiency difference:
                  </p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li><strong>High impact:</strong> Differences greater than 15 points typically decide games</li>
                    <li><strong>Medium impact:</strong> Differences of 5-15 points create meaningful advantages</li>
                    <li><strong>Low impact:</strong> Differences under 5 points have minimal game impact</li>
                  </ul>
                  <p>
                    <strong>Data quality</strong> improves with more games played. Teams with fewer than 4 games may show less reliable metrics.
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* No data fallback */}
        {comparisons.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>Insufficient efficiency data available for comparison.</p>
            <p className="text-sm mt-1">More games needed to generate reliable efficiency metrics.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EfficiencyComparisonSection;