import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EnrichedGame } from "@college-pickem/shared";

interface ConfidenceBadgeProps {
  prediction: EnrichedGame['prediction'];
  size?: 'sm' | 'default';
}

export default function ConfidenceBadge({ prediction, size = 'default' }: ConfidenceBadgeProps) {
  if (!prediction) return null;

  const { confidence, statisticalConfidence } = prediction;
  
  const getConfidenceLevel = (confidence: number): 'High' | 'Medium' | 'Low' => {
    if (confidence >= 80) return 'High';
    if (confidence >= 60) return 'Medium';
    return 'Low';
  };

  const getVariant = (level: 'High' | 'Medium' | 'Low') => {
    switch (level) {
      case 'High': return 'default';
      case 'Medium': return 'secondary';
      case 'Low': return 'destructive';
    }
  };

  const confidenceLevel = statisticalConfidence?.predictionReliability || getConfidenceLevel(confidence);
  const variant = getVariant(confidenceLevel);

  const tooltipContent = (
    <div className="space-y-2 max-w-xs">
      <div className="font-semibold">Prediction Confidence: {confidence}%</div>
      {statisticalConfidence && (
        <>
          <div className="text-sm">
            <div>Model Quality: {(statisticalConfidence.modelRSquared * 100).toFixed(1)}%</div>
            <div>Sample Size: {statisticalConfidence.sampleSizeAdequate ? 'Adequate' : 'Limited'}</div>
          </div>
          {statisticalConfidence.weightsLastUpdated && (
            <div className="text-xs text-muted-foreground">
              Weights updated: {new Date(statisticalConfidence.weightsLastUpdated).toLocaleDateString()}
            </div>
          )}
        </>
      )}
      <div className="text-xs text-muted-foreground">
        {confidenceLevel === 'High' && 'High statistical confidence in prediction accuracy'}
        {confidenceLevel === 'Medium' && 'Moderate confidence - prediction has some uncertainty'}
        {confidenceLevel === 'Low' && 'Low confidence - prediction should be interpreted cautiously'}
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={variant} className={size === 'sm' ? 'text-xs px-2 py-0.5' : ''}>
            {confidenceLevel} ({confidence}%)
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}