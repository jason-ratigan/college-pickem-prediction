import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EnrichedGame } from "@college-pickem/shared";

interface PredictionRangeProps {
  game: EnrichedGame;
  team: 'home' | 'away';
  className?: string;
}

export default function PredictionRange({ game, team, className = "" }: PredictionRangeProps) {
  if (!game.prediction) return null;

  const { prediction } = game;
  const expectedScore = prediction.expectedScore[team];
  const confidenceInterval = prediction.statisticalConfidence?.confidenceInterval?.[team];

  // If no confidence interval, show just the expected score
  if (!confidenceInterval) {
    return (
      <div className={`font-bold text-xl ${className}`}>
        {expectedScore}
      </div>
    );
  }

  const [lowerBound, upperBound] = confidenceInterval;
  const range = upperBound - lowerBound;
  
  const tooltipContent = (
    <div className="space-y-2">
      <div className="font-semibold">Score Prediction</div>
      <div className="text-sm">
        <div>Expected: {expectedScore} points</div>
        <div>Range: {lowerBound.toFixed(1)} - {upperBound.toFixed(1)} points</div>
        <div>Confidence Interval: ±{(range / 2).toFixed(1)} points</div>
      </div>
      <div className="text-xs text-muted-foreground">
        Based on statistical analysis of team efficiency and opponent baselines
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`font-bold text-xl cursor-help ${className}`}>
            <div className="text-center">
              <div>{expectedScore}</div>
              <div className="text-xs text-muted-foreground font-normal">
                ({lowerBound.toFixed(0)}-{upperBound.toFixed(0)})
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}