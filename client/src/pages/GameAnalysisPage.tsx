import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import StatCompareRow from "@/components/StatCompareRow";
import EfficiencyComparisonSection from "@/components/EfficiencyComparisonSection";
import StatisticalDeepDiveCard from "@/components/StatisticalDeepDiveCard";

// --- API Helper Function ---
const fetchGameAnalysis = async (gameId: number) => {
  const res = await fetch(`/api/v1/games/${gameId}/analysis`);
  if (!res.ok) throw new Error("Failed to fetch game analysis");
  return res.json();
};

// FIX: Added a robust helper function to get the correct short name for a team.
const getShortName = (team: { name: string, abbreviation?: string }) => {
  return team?.abbreviation || team?.name.split(' ').pop();
};

// --- Component ---
export default function GameAnalysisPage() {
  const { gameId } = useParams();
  const [, navigate] = useLocation();
  const gameIdNum = parseInt(gameId as string);

  const { data: analysis, isLoading, error } = useQuery({
    queryKey: ["gameAnalysis", gameIdNum],
    queryFn: () => fetchGameAnalysis(gameIdNum),
    enabled: !!gameIdNum,
  });

  const formatGameTime = (gameTime: string | null) => {
    if (!gameTime) return 'TBD';
    const date = new Date(gameTime);
    return new Intl.DateTimeFormat('en-US', { 
      month: 'long', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit' 
    }).format(date);
  };

  if (isLoading) {
    return <GameAnalysisSkeleton />;
  }

  if (error || !analysis) {
    return <GameAnalysisError onBack={() => navigate("/games")} />;
  }

  const { game, prediction, boxScoreStats, historicalMatchups, efficiencyAnalysis, headlineStats } = analysis;

  const hasBettingLines = game.spread !== null && game.overUnder !== null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <Button variant="ghost" onClick={() => navigate("/games")}>
            ← Back to Games
          </Button>
        </div>

        {/* Game Header */}
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <Badge variant={game.isFinal ? "default" : "secondary"}>
              {game.isFinal ? 'Final' : 'Upcoming'}
            </Badge>
            <span className="text-sm text-gray-500">{formatGameTime(game.gameTime)}</span>
          </div>

          <div className="grid grid-cols-3 items-center gap-4 text-center">
            <Link href={`/teams/${game.awayTeam.id}`} className="flex flex-col items-center group">
              <img src={game.awayTeam.logoUrl || ''} alt={game.awayTeam.name} className="w-16 h-16 mb-2" />
              <h2 className="font-bold text-lg group-hover:underline">{game.awayTeam.name}</h2>
            </Link>
            
            <div className="font-bold text-3xl">
              {game.isFinal 
                ? `${game.awayTeamScore} - ${game.homeTeamScore}` 
                : prediction 
                  ? `${prediction.expectedScore.away} - ${prediction.expectedScore.home}` 
                  : 'vs'
              }
            </div>

            <Link href={`/teams/${game.homeTeam.id}`} className="flex flex-col items-center group">
              <img src={game.homeTeam.logoUrl || ''} alt={game.homeTeam.name} className="w-16 h-16 mb-2" />
              <h2 className="font-bold text-lg group-hover:underline">{game.homeTeam.name}</h2>
            </Link>
          </div>

          {hasBettingLines && (
            <div className="text-center mt-4 text-sm text-gray-600">
              {/* FIX: Used getShortName for correct team name */}
              Spread: {getShortName(game.homeTeam)} {game.spread > 0 ? `+${game.spread}` : game.spread} | O/U: {game.overUnder}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Expected Performance Metrics */}
          {prediction && !game.isFinal && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Expected Performance Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <h4 className="font-semibold text-lg mb-3">Predicted Score</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        {/* FIX: Used getShortName for correct team name */}
                        <span>{getShortName(game.awayTeam)}</span>
                        <span className="text-2xl font-bold">{Math.round(prediction.expectedScore.away)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        {/* FIX: Used getShortName for correct team name */}
                        <span>{getShortName(game.homeTeam)}</span>
                        <span className="text-2xl font-bold">{Math.round(prediction.expectedScore.home)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <h4 className="font-semibold text-lg mb-3">Spread Analysis</h4>
                    <div className="space-y-2">
                      <div className="text-sm text-gray-600">Predicted Spread</div>
                      <div className="text-2xl font-bold">
                        {prediction.spread > 0 
                          // FIX: Used getShortName for correct team names
                          ? `${getShortName(game.awayTeam)} +${Math.abs(prediction.spread).toFixed(1)}`
                          : `${getShortName(game.homeTeam)} ${prediction.spread.toFixed(1)}`
                        }
                      </div>
                      {game.spread !== null && (
                        <div className="text-sm text-gray-500">
                          {/* FIX: Used getShortName for correct team name */}
                          Vegas: {getShortName(game.homeTeam)} {game.spread > 0 ? `+${game.spread}` : game.spread}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <h4 className="font-semibold text-lg mb-3">Total Points</h4>
                    <div className="space-y-2">
                      <div className="text-sm text-gray-600">Predicted Total</div>
                      <div className="text-2xl font-bold">{Math.round(prediction.total || 0)}</div>
                      {game.overUnder !== null && (
                        <div className="text-sm text-gray-500">
                          Vegas O/U: {game.overUnder}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {/* Prediction Analysis */}
          {prediction && !game.isFinal && (
            <Card>
              <CardHeader>
                <CardTitle>Prediction Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">Win Probability</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>{game.awayTeam.name}</span>
                      <span className="font-bold">{Math.round(100 - prediction.winProbability)}%</span>
                    </div>
                    <Progress value={100 - prediction.winProbability} className="h-2" />
                    <div className="flex justify-between">
                      <span>{game.homeTeam.name}</span>
                      <span className="font-bold">{Math.round(prediction.winProbability)}%</span>
                    </div>
                    <Progress value={prediction.winProbability} className="h-2" />
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-600">Prediction Confidence</div>
                    <div className="text-xl font-bold text-green-600">{Math.round(prediction.confidence)}%</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Predicted Total</div>
                    <div className="text-xl font-bold">{Math.round(prediction.total || 0)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Statistical Deep Dive - Consolidated Stats Component */}
          {(headlineStats || efficiencyAnalysis) && (
            <StatisticalDeepDiveCard
              game={game}
              headlineStats={headlineStats}
              efficiencyAnalysis={efficiencyAnalysis}
              season={game.season}
            />
          )}

          {/* Box Score Statistics redesigned layout */}
          {boxScoreStats && game.isFinal && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Game Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {boxScoreStats.awayTeam && boxScoreStats.homeTeam && (
                    <>
                      <StatCompareRow
                        label="Total Yards"
                        awayValue={boxScoreStats.awayTeam.totalYards}
                        homeValue={boxScoreStats.homeTeam.totalYards}
                        awayTeam={game.awayTeam}
                        homeTeam={game.homeTeam}
                      />
                      <StatCompareRow
                        label="Passing Yards"
                        awayValue={boxScoreStats.awayTeam.netPassingYards}
                        homeValue={boxScoreStats.homeTeam.netPassingYards}
                        awayTeam={game.awayTeam}
                        homeTeam={game.homeTeam}
                      />
                      <StatCompareRow
                        label="Rushing Yards"
                        awayValue={boxScoreStats.awayTeam.rushingYards}
                        homeValue={boxScoreStats.homeTeam.rushingYards}
                        awayTeam={game.awayTeam}
                        homeTeam={game.homeTeam}
                      />
                      <StatCompareRow
                        label="Turnovers"
                        awayValue={boxScoreStats.awayTeam.turnovers}
                        homeValue={boxScoreStats.homeTeam.turnovers}
                        awayTeam={game.awayTeam}
                        homeTeam={game.homeTeam}
                        lowerIsBetter
                      />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Historical Matchups */}
          {historicalMatchups && historicalMatchups.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Recent Matchups</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {historicalMatchups.map((matchup: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-md bg-gray-50">
                      <div className="flex items-center gap-4">
                        <Badge variant="outline">{matchup.season} W{matchup.week}</Badge>
                        <span className="text-sm">
                          {matchup.awayTeam.name} @ {matchup.homeTeam.name}
                        </span>
                      </div>
                      <div className="font-bold">
                        {matchup.awayScore} - {matchup.homeScore}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

// --- Sub-components ---

// FIX: Updated types to accept the full team object
type Team = { name: string, abbreviation?: string };

const StatRow = ({ 
  label, 
  awayValue, 
  homeValue, 
  awayTeam, 
  homeTeam, 
  lowerIsBetter = false 
}: {
  label: string;
  awayValue: number | null;
  homeValue: number | null;
  awayTeam: Team;
  homeTeam: Team;
  lowerIsBetter?: boolean;
}) => {
  const awayVal = awayValue ?? 0;
  const homeVal = homeValue ?? 0;
  const awayBetter = lowerIsBetter ? awayVal < homeVal : awayVal > homeVal;
  
  return (
    <div>
      <div className="text-sm font-medium text-gray-700 mb-2">{label}</div>
      <div className="flex justify-between items-center">
        <div className={`text-right ${awayBetter ? 'font-bold text-green-600' : ''}`}>
          {/* FIX: Used getShortName in the sub-component */}
          <div className="text-xs text-gray-500">{getShortName(awayTeam)}</div>
          <div>{awayVal}</div>
        </div>
        <div className="mx-4 text-gray-400">vs</div>
        <div className={`text-left ${!awayBetter ? 'font-bold text-green-600' : ''}`}>
          {/* FIX: Used getShortName in the sub-component */}
          <div className="text-xs text-gray-500">{getShortName(homeTeam)}</div>
          <div>{homeVal}</div>
        </div>
      </div>
    </div>
  );
};

const GameAnalysisSkeleton = () => (
  <div className="min-h-screen bg-gray-50">
    <Navigation />
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Skeleton className="h-8 w-32 mb-6" />
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
        <div className="grid grid-cols-3 items-center gap-4 text-center">
          <div className="flex flex-col items-center">
            <Skeleton className="w-16 h-16 rounded-full mb-2" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-10 w-24 mx-auto" />
          <div className="flex flex-col items-center">
            <Skeleton className="w-16 h-16 rounded-full mb-2" />
            <Skeleton className="h-6 w-32" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </main>
  </div>
);

const GameAnalysisError = ({ onBack }: { onBack: () => void }) => (
  <div className="min-h-screen bg-gray-50">
    <Navigation />
    <main className="text-center py-20">
      <h1 className="text-xl font-bold">Game Analysis Not Found</h1>
      <p className="text-gray-600">The game analysis could not be loaded.</p>
      <Button onClick={onBack} className="mt-4">Back to Games</Button>
    </main>
  </div>
);