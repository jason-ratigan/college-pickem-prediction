import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EnrichedGame, PickSelect } from "@college-pickem/shared";
import ConfidenceBadge from "./ConfidenceBadge";
import PredictionRange from "./PredictionRange";
import EfficiencyVisualization from "./EfficiencyVisualization";
import PredictionDetailsModal from "./PredictionDetailsModal";

export type PickUpdate = {
  gameId: number;
  pickedTeamId?: number | null;
  pickedAgainstSpread?: 'home' | 'away' | null;
};

interface GameCardProps {
  game: EnrichedGame;
  userPick: PickSelect | null;
  localPickUpdate?: PickUpdate;
  onPickChange: (update: PickUpdate) => void;
  onFeaturedToggle?: (gameId: number, isFeatured: boolean) => void;
  isAuthenticated?: boolean;
}

export default function GameCard({ game, userPick, localPickUpdate, onPickChange, onFeaturedToggle, isAuthenticated }: GameCardProps) {
  const [, navigate] = useLocation();
  const [showPredictionDetails, setShowPredictionDetails] = useState(false);

  const effectivePickedTeamId = useMemo(() => 
    localPickUpdate?.pickedTeamId !== undefined ? localPickUpdate.pickedTeamId : userPick?.pickedTeamId
  , [localPickUpdate, userPick]);

  const effectiveSpreadPick = useMemo(() =>
    localPickUpdate?.pickedAgainstSpread !== undefined ? localPickUpdate.pickedAgainstSpread : userPick?.pickedAgainstSpread
  , [localPickUpdate, userPick]);
  
  const isStraightPickDirty = localPickUpdate?.pickedTeamId !== undefined && localPickUpdate.pickedTeamId !== userPick?.pickedTeamId;
  const isSpreadPickDirty = localPickUpdate?.pickedAgainstSpread !== undefined && localPickUpdate.pickedAgainstSpread !== userPick?.pickedAgainstSpread;

  const handleStraightPick = (teamId: number) => {
    const newPickedTeamId = effectivePickedTeamId === teamId ? null : teamId;
    onPickChange({ gameId: game.id, pickedTeamId: newPickedTeamId });
  };

  const handleSpreadPick = (side: 'home' | 'away') => {
    const newSpreadPick = effectiveSpreadPick === side ? null : side;
    onPickChange({ gameId: game.id, pickedAgainstSpread: newSpreadPick });
  };
  
  const formatGameTime = (gameDate: Date | null) => {
    if (!gameDate) return 'TBD';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(gameDate));
  };
  
  const spreadDisplay = game.spread ? `(${game.homeTeam.name.split(' ').pop()} ${game.spread})` : '';

  const isPickable = !game.isFinal && game.gameTime && new Date() < game.gameTime;

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Badge variant={game.isFinal ? "default" : "secondary"}>
              {game.isFinal ? 'Final' : 'Upcoming'}
            </Badge>
            {game.isFeaturedGame && (
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                ⭐ Featured
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && onFeaturedToggle && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onFeaturedToggle(game.id, !game.isFeaturedGame)}
                className="h-6 px-2 text-xs"
                title={game.isFeaturedGame ? "Remove from featured" : "Mark as featured"}
              >
                {game.isFeaturedGame ? "⭐" : "☆"}
              </Button>
            )}
            <span className="text-sm text-gray-500">{formatGameTime(game.gameTime)}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 items-center gap-2 text-center">
          <div className="flex flex-col sm:flex-row items-center gap-2 justify-start text-left">
            <img src={game.awayTeam.logoUrl || ''} alt={game.awayTeam.name} className="w-8 h-8 sm:w-10 sm:h-10" />
            <span className="font-semibold text-sm sm:text-base cursor-pointer underline-offset-2 hover:underline" onClick={() => navigate(`/teams/${game.awayTeam.id}`)}>{game.awayTeam.name}</span>
          </div>
          
          <div className="font-bold text-xl cursor-pointer group relative" onClick={() => navigate(`/games/${game.id}/analysis`)}>
            {game.isFinal 
              ? `${game.awayTeamScore} - ${game.homeTeamScore}` 
              : game.prediction 
                ? (
                  <div className="flex items-center gap-1">
                    <PredictionRange game={game} team="away" />
                    <span className="text-muted-foreground">-</span>
                    <PredictionRange game={game} team="home" />
                  </div>
                )
                : 'vs'
            }
            {game.headlineStats && (
              <div className="hidden md:block absolute left-1/2 -translate-x-1/2 top-full mt-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="bg-white border shadow-lg rounded-md p-3 text-xs w-[320px]">
                  <div className="font-semibold text-gray-700 mb-1">Team Averages (Season)</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] text-gray-500 mb-1">{game.awayTeam.name}</div>
                      <ul className="space-y-0.5">
                        <li>Pts/G: <span className="font-medium">{game.headlineStats.away.pointsPerGame}</span></li>
                        <li>Pass/Rush: <span className="font-medium">{game.headlineStats.away.passYardsPerGame}/{game.headlineStats.away.rushYardsPerGame}</span></li>
                        <li>Allowed P/R: <span className="font-medium">{game.headlineStats.away.passYardsAllowedPerGame}/{game.headlineStats.away.rushYardsAllowedPerGame}</span></li>
                        {/* FIX: Corrected display for turnovers and FG */}
                        <li>TO Lost/G: <span className="font-medium">{game.headlineStats.away.turnoversLostPerGame}</span></li>
                        <li>TO Gained/G: <span className="font-medium">{game.headlineStats.away.turnoversGainedPerGame}</span></li>
                        <li>Sacks/G: <span className="font-medium">{game.headlineStats.away.sacksPerGame}</span></li>
                        <li>FG: <span className="font-medium">{game.headlineStats.away.fgMadePerGame}/{game.headlineStats.away.fgAttPerGame}</span></li>
                      </ul>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500 mb-1">{game.homeTeam.name}</div>
                      <ul className="space-y-0.5">
                        <li>Pts/G: <span className="font-medium">{game.headlineStats.home.pointsPerGame}</span></li>
                        <li>Pass/Rush: <span className="font-medium">{game.headlineStats.home.passYardsPerGame}/{game.headlineStats.home.rushYardsPerGame}</span></li>
                        <li>Allowed P/R: <span className="font-medium">{game.headlineStats.home.passYardsAllowedPerGame}/{game.headlineStats.home.rushYardsAllowedPerGame}</span></li>
                        {/* FIX: Corrected display for turnovers and FG */}
                        <li>TO Lost/G: <span className="font-medium">{game.headlineStats.home.turnoversLostPerGame}</span></li>
                        <li>TO Gained/G: <span className="font-medium">{game.headlineStats.home.turnoversGainedPerGame}</span></li>
                        <li>Sacks/G: <span className="font-medium">{game.headlineStats.home.sacksPerGame}</span></li>
                        <li>FG: <span className="font-medium">{game.headlineStats.home.fgMadePerGame}/{game.headlineStats.home.fgAttPerGame}</span></li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row-reverse items-center gap-2 justify-end text-right">
            <img src={game.homeTeam.logoUrl || ''} alt={game.homeTeam.name} className="w-8 h-8 sm:w-10 sm:h-10" />
            <span className="font-semibold text-sm sm:text-base cursor-pointer underline-offset-2 hover:underline" onClick={() => navigate(`/teams/${game.homeTeam.id}`)}>{game.homeTeam.name}</span>
          </div>
        </div>

        {/* Enhanced Prediction Details */}
        {game.prediction && !game.isFinal && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ConfidenceBadge prediction={game.prediction} size="sm" />
                {game.prediction.statisticalConfidence && (
                  <Badge variant="outline" className="text-xs">
                    R² {(game.prediction.statisticalConfidence.modelRSquared * 100).toFixed(0)}%
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPredictionDetails(true)}
                className="text-xs"
              >
                View Details
              </Button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-semibold text-gray-700 mb-1">Win Probability</div>
                <div className="flex justify-between">
                  <span>{game.awayTeam.name.split(' ').pop()}: {game.prediction.winProbability.away}%</span>
                  <span>{game.homeTeam.name.split(' ').pop()}: {game.prediction.winProbability.home}%</span>
                </div>
              </div>
              <div>
                <div className="font-semibold text-gray-700 mb-1">Spread</div>
                <div className="text-center">
                  {game.prediction.expectedScore.home - game.prediction.expectedScore.away > 0 
                    ? `${game.homeTeam.name.split(' ').pop()} -${Math.abs(game.prediction.expectedScore.home - game.prediction.expectedScore.away)}`
                    : `${game.awayTeam.name.split(' ').pop()} -${Math.abs(game.prediction.expectedScore.away - game.prediction.expectedScore.home)}`
                  }
                </div>
              </div>
            </div>
            
            {/* Efficiency Visualization for Featured Games */}
            {game.isFeaturedGame && game.prediction.calculationBreakdown && (
              <div className="mt-4 pt-4 border-t bg-yellow-50 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-2">{game.awayTeam.name} Efficiency</div>
                    <EfficiencyVisualization game={game} team="away" compact />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-2">{game.homeTeam.name} Efficiency</div>
                    <EfficiencyVisualization game={game} team="home" compact />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Completed Game Statistics */}
        {game.isFinal && (
          <div className="mt-4 pt-4 border-t">
            <div className="text-center">
              <Badge variant="default" className="mb-2">Final Score</Badge>
              <div className="text-sm text-gray-600">
                Game completed - <Button 
                  variant="link" 
                  className="p-0 h-auto text-sm"
                  onClick={() => navigate(`/games/${game.id}/analysis`)}
                >
                  View detailed analysis
                </Button>
              </div>
            </div>
          </div>
        )}

        {isAuthenticated && isPickable && (
          <div className="mt-4 pt-4 border-t">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="font-semibold text-xs mb-2 block">WINNER</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={effectivePickedTeamId === game.awayTeam.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleStraightPick(game.awayTeam.id)}
                    className="relative"
                  >
                    {game.awayTeam.name.split(' ').pop()}
                    {isStraightPickDirty && effectivePickedTeamId === game.awayTeam.id && <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-blue-500" />}
                  </Button>
                  <Button
                    variant={effectivePickedTeamId === game.homeTeam.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleStraightPick(game.homeTeam.id)}
                    className="relative"
                  >
                    {game.homeTeam.name.split(' ').pop()}
                    {isStraightPickDirty && effectivePickedTeamId === game.homeTeam.id && <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-blue-500" />}
                  </Button>
                </div>
              </div>

              {game.spread && (
                <div>
                  <Label className="font-semibold text-xs mb-2 block">AGAINST THE SPREAD <span className="text-gray-500 font-normal">{spreadDisplay}</span></Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={effectiveSpreadPick === 'away' ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleSpreadPick('away')}
                      className="relative"
                    >
                      {game.awayTeam.name.split(' ').pop()}
                      {isSpreadPickDirty && effectiveSpreadPick === 'away' && <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-blue-500" />}
                    </Button>
                    <Button
                      variant={effectiveSpreadPick === 'home' ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleSpreadPick('home')}
                      className="relative"
                    >
                      {game.homeTeam.name.split(' ').pop()}
                      {isSpreadPickDirty && effectiveSpreadPick === 'home' && <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-blue-500" />}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
      
      {/* Prediction Details Modal */}
      <PredictionDetailsModal
        game={game}
        isOpen={showPredictionDetails}
        onClose={() => setShowPredictionDetails(false)}
      />
    </Card>
  );
}