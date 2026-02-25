import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EnrichedGame } from "@college-pickem/shared";

interface EfficiencyVisualizationProps {
  game: EnrichedGame;
  team: 'home' | 'away';
  compact?: boolean;
}

export default function EfficiencyVisualization({ game, team, compact = false }: EfficiencyVisualizationProps) {
  if (!game.prediction?.calculationBreakdown) return null;

  const breakdown = game.prediction.calculationBreakdown[`${team}Team`];
  const teamName = team === 'home' ? game.homeTeam.name : game.awayTeam.name;
  const opponentName = team === 'home' ? game.awayTeam.name : game.homeTeam.name;

  const formatEfficiencyValue = (value: number) => {
    return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  };

  const getEfficiencyColor = (value: number) => {
    if (value > 5) return 'text-green-600';
    if (value > 0) return 'text-green-500';
    if (value > -5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getProgressColor = (value: number) => {
    if (value > 5) return 'bg-green-500';
    if (value > 0) return 'bg-green-400';
    if (value > -5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Calculate the maximum absolute value for scaling
  const maxAbsValue = Math.max(
    ...Object.values(breakdown.efficiencyContributions).map(v => Math.abs(Number(v)))
  );
  const scale = maxAbsValue > 0 ? 100 / maxAbsValue : 1;

  const tooltipContent = (
    <div className="space-y-3 max-w-sm">
      <div className="font-semibold">{teamName} Efficiency Breakdown</div>
      
      <div className="space-y-2">
        <div className="text-sm">
          <div className="font-medium">Opponent Baseline:</div>
          <div className="text-muted-foreground">
            {opponentName} typically allows {breakdown.opponentBaseline.toFixed(1)} points
          </div>
        </div>
        
        <div className="text-sm">
          <div className="font-medium">Efficiency Contributions:</div>
          <div className="space-y-1 mt-1">
            {Object.entries(breakdown.efficiencyContributions).map(([category, value]) => (
              <div key={category} className="flex justify-between">
                <span className="capitalize">{category.replace(/([A-Z])/g, ' $1').trim()}:</span>
                <span className={getEfficiencyColor(Number(value))}>
                  {formatEfficiencyValue(Number(value))} pts
                </span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="text-sm">
          <div className="font-medium">Statistical Weights:</div>
          <div className="space-y-1 mt-1">
            {Object.entries(breakdown.weightsUsed).map(([category, weight]) => (
              <div key={category} className="flex justify-between">
                <span className="capitalize">{category.replace(/([A-Z])/g, ' $1').trim()}:</span>
                <span>{(Number(weight) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="text-xs text-muted-foreground border-t pt-2">
        Positive values indicate above-average performance vs this opponent
      </div>
    </div>
  );

  if (compact) {
    // Compact view - just show the most significant efficiency
    const significantEfficiencies = Object.entries(breakdown.efficiencyContributions)
      .sort(([,a], [,b]) => Math.abs(Number(b)) - Math.abs(Number(a)))
      .slice(0, 2);

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-xs space-y-1 cursor-help">
              {significantEfficiencies.map(([category, value]) => (
                <div key={category} className="flex justify-between items-center">
                  <span className="capitalize text-muted-foreground">
                    {category.replace(/([A-Z])/g, ' $1').trim()}:
                  </span>
                  <span className={`font-medium ${getEfficiencyColor(Number(value))}`}>
                    {formatEfficiencyValue(Number(value))}
                  </span>
                </div>
              ))}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full view with progress bars
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="space-y-3 cursor-help">
            <div className="text-sm font-medium text-center">
              {teamName} Efficiency vs {opponentName}
            </div>
            
            <div className="space-y-2">
              {Object.entries(breakdown.efficiencyContributions).map(([category, value]) => {
                const numValue = Number(value);
                const progressValue = Math.abs(numValue) * scale;
                return (
                  <div key={category} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="capitalize">{category.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className={`font-medium ${getEfficiencyColor(numValue)}`}>
                        {formatEfficiencyValue(numValue)}
                      </span>
                    </div>
                    <div className="relative">
                      <Progress 
                        value={progressValue} 
                        className="h-2"
                      />
                      <div 
                        className={`absolute top-0 left-0 h-2 rounded-full ${getProgressColor(numValue)}`}
                        style={{ width: `${progressValue}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="text-xs text-center text-muted-foreground border-t pt-2">
              Baseline: {breakdown.opponentBaseline.toFixed(1)} pts (what opponent typically allows)
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}