import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnrichedGame } from "@college-pickem/shared";

interface PredictionDetailsModalProps {
  game: EnrichedGame;
  isOpen: boolean;
  onClose: () => void;
}

export default function PredictionDetailsModal({ game, isOpen, onClose }: PredictionDetailsModalProps) {
  if (!game.prediction) return null;

  const { prediction } = game;
  const { statisticalConfidence, calculationBreakdown } = prediction;

  const getConfidenceBadgeVariant = (reliability: string) => {
    switch (reliability) {
      case 'High': return 'default';
      case 'Medium': return 'secondary';
      case 'Low': return 'destructive';
      default: return 'outline';
    }
  };

  const formatEfficiencyValue = (value: number) => {
    return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  };

  const formatConfidenceInterval = (interval: [number, number]) => {
    return `${interval[0].toFixed(1)} - ${interval[1].toFixed(1)}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <img src={game.awayTeam.logoUrl || ''} alt={game.awayTeam.name} className="w-8 h-8" />
              <span>{game.awayTeam.name}</span>
            </div>
            <span className="text-muted-foreground">vs</span>
            <div className="flex items-center gap-2">
              <img src={game.homeTeam.logoUrl || ''} alt={game.homeTeam.name} className="w-8 h-8" />
              <span>{game.homeTeam.name}</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Prediction Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Prediction Summary</span>
                {statisticalConfidence && (
                  <Badge variant={getConfidenceBadgeVariant(statisticalConfidence.predictionReliability)}>
                    {statisticalConfidence.predictionReliability} Confidence
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {prediction.expectedScore.away}
                  </div>
                  <div className="text-sm text-muted-foreground">{game.awayTeam.name}</div>
                  {statisticalConfidence?.confidenceInterval && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Range: {formatConfidenceInterval(statisticalConfidence.confidenceInterval.away)}
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600">
                    {prediction.expectedScore.home}
                  </div>
                  <div className="text-sm text-muted-foreground">{game.homeTeam.name}</div>
                  {statisticalConfidence?.confidenceInterval && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Range: {formatConfidenceInterval(statisticalConfidence.confidenceInterval.home)}
                    </div>
                  )}
                </div>
              </div>
              
              <Separator className="my-4" />
              
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-sm text-muted-foreground">Win Probability</div>
                  <div className="font-semibold">
                    {game.awayTeam.name.split(' ').pop()}: {prediction.winProbability.away}%
                  </div>
                  <div className="font-semibold">
                    {game.homeTeam.name.split(' ').pop()}: {prediction.winProbability.home}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Spread</div>
                  <div className="font-semibold">
                    {prediction.expectedScore.home - prediction.expectedScore.away > 0 
                      ? `${game.homeTeam.name.split(' ').pop()} -${Math.abs(prediction.expectedScore.home - prediction.expectedScore.away)}`
                      : `${game.awayTeam.name.split(' ').pop()} -${Math.abs(prediction.expectedScore.away - prediction.expectedScore.home)}`
                    }
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total</div>
                  <div className="font-semibold">
                    {prediction.expectedScore.home + prediction.expectedScore.away}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Statistical Confidence */}
          {statisticalConfidence && (
            <Card>
              <CardHeader>
                <CardTitle>Statistical Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm">Model Quality (R²)</span>
                      <span className="font-semibold">{(statisticalConfidence.modelRSquared * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={statisticalConfidence.modelRSquared * 100} className="h-2" />
                    <div className="text-xs text-muted-foreground mt-1">
                      Higher values indicate better predictive accuracy
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm">Sample Size</span>
                      <Badge variant={statisticalConfidence.sampleSizeAdequate ? "default" : "destructive"}>
                        {statisticalConfidence.sampleSizeAdequate ? "Adequate" : "Limited"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {statisticalConfidence.sampleSizeAdequate 
                        ? "Sufficient games played for reliable predictions"
                        : "Limited game data may affect prediction accuracy"
                      }
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Calculation Breakdown */}
          {calculationBreakdown && (
            <Tabs defaultValue="away" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="away">{game.awayTeam.name} Breakdown</TabsTrigger>
                <TabsTrigger value="home">{game.homeTeam.name} Breakdown</TabsTrigger>
              </TabsList>
              
              <TabsContent value="away" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{game.awayTeam.name} Scoring Prediction</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span>Opponent Baseline (what {game.homeTeam.name} typically allows)</span>
                        <span className="font-semibold">{calculationBreakdown.awayTeam.opponentBaseline.toFixed(1)} pts</span>
                      </div>
                      
                      <Separator />
                      
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-muted-foreground">Efficiency Contributions:</div>
                        {Object.entries(calculationBreakdown.awayTeam.efficiencyContributions).map(([category, value]) => (
                          <div key={category} className="flex justify-between items-center pl-4">
                            <span className="capitalize">{category.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold ${Number(value) > 0 ? 'text-green-600' : Number(value) < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                {formatEfficiencyValue(Number(value))}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                (×{Number(calculationBreakdown.awayTeam.weightsUsed[category] || 1).toFixed(2)})
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <Separator />
                      
                      <div className="flex justify-between items-center font-bold text-lg">
                        <span>Predicted Score</span>
                        <span className="text-blue-600">{prediction.expectedScore.away} pts</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="home" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{game.homeTeam.name} Scoring Prediction</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span>Opponent Baseline (what {game.awayTeam.name} typically allows)</span>
                        <span className="font-semibold">{calculationBreakdown.homeTeam.opponentBaseline.toFixed(1)} pts</span>
                      </div>
                      
                      <Separator />
                      
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-muted-foreground">Efficiency Contributions:</div>
                        {Object.entries(calculationBreakdown.homeTeam.efficiencyContributions).map(([category, value]) => (
                          <div key={category} className="flex justify-between items-center pl-4">
                            <span className="capitalize">{category.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold ${Number(value) > 0 ? 'text-green-600' : Number(value) < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                {formatEfficiencyValue(Number(value))}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                (×{Number(calculationBreakdown.homeTeam.weightsUsed[category] || 1).toFixed(2)})
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <Separator />
                      
                      <div className="flex justify-between items-center font-bold text-lg">
                        <span>Predicted Score</span>
                        <span className="text-red-600">{prediction.expectedScore.home} pts</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          {/* Model Information */}
          {statisticalConfidence?.weightsUsed && (
            <Card>
              <CardHeader>
                <CardTitle>Statistical Weights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(statisticalConfidence.weightsUsed || {}).map(([metric, weight]) => (
                    <div key={metric} className="flex justify-between items-center">
                      <span className="capitalize text-sm">{metric.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={Number(weight) * 100} className="w-16 h-2" />
                        <span className="text-sm font-semibold w-12">{(Number(weight) * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                {statisticalConfidence.weightsLastUpdated && (
                  <div className="text-xs text-muted-foreground mt-4">
                    Weights last updated: {new Date(statisticalConfidence.weightsLastUpdated).toLocaleDateString()}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}