import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// FIX: Import the full TeamProfile and the new StatisticalAnalysis type
import type { TeamProfile as TeamProfileType, StatisticalAnalysis } from "@college-pickem/shared";

// FIX: Local StatisticalAnalysis type is removed, it now comes from shared/types.ts

// --- API Helper Function ---
const fetchTeamProfile = async (teamId: number, season: number): Promise<TeamProfileType> => {
  const res = await fetch(`/api/v1/teams/${teamId}/profile?season=${season}`);
  if (!res.ok) throw new Error("Failed to fetch team profile");
  return res.json();
};

const generateYearOptions = () => {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => currentYear - i);
};

// --- Component ---
export default function TeamProfile() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const teamId = parseInt(id as string);

  const [selectedSeason, setSelectedSeason] = useState<number>(new Date().getFullYear());

  const { data: teamProfile, isLoading, error } = useQuery({
    queryKey: ["teamProfile", teamId, selectedSeason],
    queryFn: () => fetchTeamProfile(teamId, selectedSeason),
    enabled: !!teamId,
  });

  const formatGameTime = (gameTime: Date | string | null) => {
    if (!gameTime) return 'TBD';
    const date = new Date(gameTime);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  };

  if (isLoading) {
    return <TeamProfileSkeleton />;
  }

  if (error || !teamProfile) {
    return <TeamProfileError onBack={() => navigate("/teams")} />;
  }

  const { team, strengthRatings, schedule, record, nextGame, statisticalAnalysis } = teamProfile;

  const derivedOverallRating = strengthRatings 
    ? (parseFloat(strengthRatings.offenseRatingAdjusted || '0') + parseFloat(strengthRatings.defenseRatingAdjusted || '0')) / 2
    : 0;

  const getOpponent = (game: typeof schedule[0]) => {
    return game.homeTeamId === team.id ? game.awayTeam : game.homeTeam;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <Button variant="ghost" onClick={() => navigate("/teams")}>
            ← Back to Teams
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600">Season:</span>
            <Select value={String(selectedSeason)} onValueChange={(year) => setSelectedSeason(Number(year))}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {generateYearOptions().map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <img src={team.logoUrl || ''} alt={`${team.name} logo`} className="w-16 h-16" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
                <p className="text-md text-gray-600">{team.conference || 'Independent'}</p>
                {record && <Badge className="mt-2">{record.wins}-{record.losses} Record</Badge>}
              </div>
            </div>
            {strengthRatings && (
              <div className="text-right">
                <div className="text-4xl font-bold text-green-700">{Math.round(derivedOverallRating)}</div>
                <div className="text-sm text-gray-500">Overall Rating</div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {strengthRatings && <StrengthRatingsCard ratings={strengthRatings} derivedOverall={derivedOverallRating} />}
            {/* FIX: Use the properly typed 'statisticalAnalysis' variable. No more 'as any'. */}
            {statisticalAnalysis ? (
              <StatisticalAnalysisCard analysis={statisticalAnalysis} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Statistical Analysis
                    <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-xs">
                      Data Quality: Insufficient
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center py-8">
                  <div className="text-gray-500">
                    <div className="text-lg font-medium mb-2">Insufficient Data</div>
                    <div className="text-sm mb-4">
                      Statistical analysis requires completed games with box score data to be available.
                    </div>
                    <div className="text-xs text-gray-400 space-y-1">
                      <div>• Need at least 1 completed game with box score statistics</div>
                      <div>• Efficiency ratings require opponent-adjusted calculations</div>
                      <div>• Check back after this team has played some games in {selectedSeason}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            {schedule && <ScheduleCard schedule={schedule} teamId={team.id} getOpponent={getOpponent} formatGameTime={formatGameTime} season={selectedSeason} />}
          </div>
          <div className="space-y-6">
            {nextGame && <NextGameCard nextGame={nextGame} teamId={team.id} getOpponent={getOpponent} formatGameTime={formatGameTime} />}
          </div>
        </div>
      </main>
    </div>
  );
}


// --- Sub-components ---

const StrengthRatingsCard = ({ ratings, derivedOverall }: { ratings: any, derivedOverall: number }) => (
  // ... (This component remains the same)
  <Card>
    <CardHeader><CardTitle>Strength Ratings ({ratings.season})</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <RatingRow label="Overall" value={derivedOverall} />
      <Separator />
      <RatingRow label="Offense" value={ratings.offenseRatingAdjusted} />
      <RatingRow label="Defense" value={ratings.defenseRatingAdjusted} />
      <RatingRow label="Pass Offense" value={ratings.passOffenseRating} />
      <RatingRow label="Rush Offense" value={ratings.rushOffenseRating} />
      <RatingRow label="Pass Defense" value={ratings.passDefenseRating} />
      <RatingRow label="Rush Defense" value={ratings.rushDefenseRating} />
    </CardContent>
  </Card>
);

const StatisticalAnalysisCard = ({ analysis }: { analysis: StatisticalAnalysis }) => {
  // ... (Helper functions inside this component remain the same)
  const getEfficiencyColor = (value: number) => {
    if (value > 5) return "text-green-600";
    if (value > 0) return "text-green-500";
    if (value > -5) return "text-gray-600";
    return "text-red-500";
  };

  const getDataQualityColor = (quality: string) => {
    switch (quality) {
      case 'Excellent': return "bg-green-100 text-green-800 border-green-200";
      case 'Good': return "bg-blue-100 text-blue-800 border-blue-200";
      case 'Limited': return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case 'Insufficient': return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Statistical Analysis
          {analysis.efficiencyRatings && (
            <Badge variant="outline" className={`text-xs ${getDataQualityColor(analysis.efficiencyRatings.dataQuality)}`}>
              Data Quality: {analysis.efficiencyRatings.dataQuality}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-semibold text-gray-800 mb-2">Offensive Stats (Per Game)</h4>
          {/* FIX: Added optional chaining (?.) to prevent crashes on incomplete data */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Passing Yards: <span className="font-medium">{(analysis.offense?.passingYards ?? 0).toFixed(1)}</span></div>
            <div>Rushing Yards: <span className="font-medium">{(analysis.offense?.rushingYards ?? 0).toFixed(1)}</span></div>
            <div>Total Yards: <span className="font-medium">{(analysis.offense?.totalYards ?? 0).toFixed(1)}</span></div>
            <div>Points: <span className="font-medium">{(analysis.offense?.pointsPerGame ?? 0).toFixed(1)}</span></div>
            <div>3rd Down Conv: <span className="font-medium">{((analysis.offense?.thirdDownConversion ?? 0) * 100).toFixed(1)}%</span></div>
            <div>Red Zone Eff: <span className="font-medium">{((analysis.offense?.redZoneEfficiency ?? 0) * 100).toFixed(1)}%</span></div>
          </div>
        </div>
        
        {analysis.efficiencyRatings && (
            // ... (Efficiency ratings section is likely safe due to the check, but remains the same)
            <>
            <Separator />
            <div>
              <h4 className="font-semibold text-gray-800 mb-2">Opponent-Adjusted Efficiency</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Pass Offense: <span className={`font-medium ml-1 ${getEfficiencyColor(analysis.efficiencyRatings.passOffense)}`}>{analysis.efficiencyRatings.passOffense > 0 ? '+' : ''}{analysis.efficiencyRatings.passOffense.toFixed(1)}</span></div>
                <div>Rush Offense: <span className={`font-medium ml-1 ${getEfficiencyColor(analysis.efficiencyRatings.rushOffense)}`}>{analysis.efficiencyRatings.rushOffense > 0 ? '+' : ''}{analysis.efficiencyRatings.rushOffense.toFixed(1)}</span></div>
                <div>Pass Defense: <span className={`font-medium ml-1 ${getEfficiencyColor(analysis.efficiencyRatings.passDefense)}`}>{analysis.efficiencyRatings.passDefense > 0 ? '+' : ''}{analysis.efficiencyRatings.passDefense.toFixed(1)}</span></div>
                <div>Rush Defense: <span className={`font-medium ml-1 ${getEfficiencyColor(analysis.efficiencyRatings.rushDefense)}`}>{analysis.efficiencyRatings.rushDefense > 0 ? '+' : ''}{analysis.efficiencyRatings.rushDefense.toFixed(1)}</span></div>
                <div>Scoring Off: <span className={`font-medium ml-1 ${getEfficiencyColor(analysis.efficiencyRatings.scoringOffense)}`}>{analysis.efficiencyRatings.scoringOffense > 0 ? '+' : ''}{analysis.efficiencyRatings.scoringOffense.toFixed(1)}</span></div>
                <div>Scoring Def: <span className={`font-medium ml-1 ${getEfficiencyColor(analysis.efficiencyRatings.scoringDefense)}`}>{analysis.efficiencyRatings.scoringDefense > 0 ? '+' : ''}{analysis.efficiencyRatings.scoringDefense.toFixed(1)}</span></div>
                <div>Turnover Margin: <span className={`font-medium ml-1 ${getEfficiencyColor(analysis.efficiencyRatings.turnover)}`}>{analysis.efficiencyRatings.turnover > 0 ? '+' : ''}{analysis.efficiencyRatings.turnover.toFixed(1)}</span></div>
                <div>Special Teams: <span className={`font-medium ml-1 ${getEfficiencyColor(analysis.efficiencyRatings.specialTeams)}`}>{analysis.efficiencyRatings.specialTeams > 0 ? '+' : ''}{analysis.efficiencyRatings.specialTeams.toFixed(1)}</span></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">Positive values indicate above-average performance vs opponents</div>
            </div>
          </>
        )}
        
        <Separator />
        <div>
          <h4 className="font-semibold text-gray-800 mb-2">Defensive Stats (Per Game)</h4>
          {/* FIX: Added optional chaining (?.) to prevent crashes on incomplete data */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Pass Yds Allowed: <span className="font-medium">{(analysis.defense?.passingYardsAllowed ?? 0).toFixed(1)}</span></div>
            <div>Rush Yds Allowed: <span className="font-medium">{(analysis.defense?.rushingYardsAllowed ?? 0).toFixed(1)}</span></div>
            <div>Total Yds Allowed: <span className="font-medium">{(analysis.defense?.totalYardsAllowed ?? 0).toFixed(1)}</span></div>
            <div>Points Allowed: <span className="font-medium">{(analysis.defense?.pointsAllowedPerGame ?? 0).toFixed(1)}</span></div>
            <div>Sacks: <span className="font-medium">{(analysis.defense?.sacks ?? 0).toFixed(1)}</span></div>
            <div>Interceptions: <span className="font-medium">{(analysis.defense?.interceptions ?? 0).toFixed(1)}</span></div>
            <div>Tackles for Loss: <span className="font-medium">{(analysis.defense?.tacklesForLoss ?? 0).toFixed(1)}</span></div>
          </div>
        </div>
        
        {(analysis.strengths?.length > 0 || analysis.weaknesses?.length > 0) && (
            // ... (This section remains the same)
            <>
            <Separator />
            <div className="space-y-2">
              {analysis.strengths.length > 0 && (<div><h4 className="font-semibold text-green-700 mb-1">Strengths (Based on Efficiency Rankings)</h4><div className="flex flex-wrap gap-1">{analysis.strengths.map((strength: string, idx: number) => (<Badge key={idx} variant="secondary" className="bg-green-100 text-green-800">{strength}</Badge>))}</div></div>)}
              {analysis.weaknesses.length > 0 && (<div><h4 className="font-semibold text-red-700 mb-1">Areas for Improvement (Based on Efficiency Rankings)</h4><div className="flex flex-wrap gap-1">{analysis.weaknesses.map((weakness: string, idx: number) => (<Badge key={idx} variant="secondary" className="bg-red-100 text-red-800">{weakness}</Badge>))}</div></div>)}
            </div>
          </>
        )}
        
        {!analysis.efficiencyRatings && (<div className="text-center py-4"><div className="text-sm text-gray-500"><div className="font-medium mb-1">Limited Efficiency Analysis</div><div>Opponent-adjusted efficiency ratings require more game data to be calculated.</div></div></div>)}
      </CardContent>
    </Card>
  );
};


// ... (The rest of the sub-components: RatingRow, ScheduleCard, NextGameCard, TeamProfileSkeleton, TeamProfileError remain the same)
const RatingRow = ({ label, value }: { label: string, value: string | number }) => {
    const numValue = typeof value === 'string' ? parseFloat(value || "0") : value;
    return (<div className="flex justify-between items-center"><span className="font-medium text-gray-700">{label}</span><div className="flex items-center space-x-3"><Progress value={numValue} className="w-24 sm:w-32" /><span className="font-bold text-gray-900 w-8 text-right">{Math.round(numValue)}</span></div></div>);
};

const ScheduleCard = ({ schedule, teamId, getOpponent, formatGameTime, season }: any) => (
  <Card>
    <CardHeader><CardTitle>{season} Schedule & Results</CardTitle></CardHeader>
    <CardContent>
      <div className="space-y-2">
        {schedule.map((game: any) => {
          const opponent = getOpponent(game);
          const isHome = game.homeTeamId === teamId;
          const isWin = game.isFinal && ((isHome && game.homeTeamScore > game.awayTeamScore) || (!isHome && game.awayTeamScore > game.homeTeamScore));
          const teamScore = isHome ? game.homeTeamScore : game.awayTeamScore;
          const opponentScore = isHome ? game.awayTeamScore : game.homeTeamScore;
          const prediction = !game.isFinal && (game as any).prediction ? (game as any).prediction : null;
          
          return (
            <div key={game.id} className="p-3 rounded-md hover:bg-gray-50 border border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={opponent.logoUrl || ''} alt={opponent.name} className="w-6 h-6" />
                  <span className="font-medium">
                    {isHome ? 'vs' : '@'}{' '}
                    <Link href={`/teams/${opponent.id}`}>
                      <a className="hover:underline">{opponent.name}</a>
                    </Link>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {game.isFinal ? (
                    <Badge variant={isWin ? 'default' : 'destructive'}>
                      {isWin ? 'W' : 'L'} {teamScore}-{opponentScore}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{formatGameTime(game.gameTime)}</Badge>
                  )}
                  <Link href={`/games/${game.id}/analysis`}>
                    <Button variant="ghost" size="sm" className="h-7">Analysis</Button>
                  </Link>
                </div>
              </div>
              
              {!game.isFinal && prediction && (
                <div className="text-xs text-gray-600 mt-2 space-y-1 pl-9">
                  <div>
                    <span className="mr-3">Win Prob: {Math.round(prediction.winProbability)}%</span>
                    <span>Predicted: {prediction.expectedScore.team}-{prediction.expectedScore.opponent}</span>
                  </div>
                  {prediction.confidence && (<div className="text-xs text-gray-500">Confidence: {Math.round(prediction.confidence)}% (based on {season} stats)</div>)}
                </div>
              )}
              
              {game.spread && (<div className="text-xs text-gray-500 mt-1 pl-9">Spread: {isHome ? '' : '@'}{opponent.name} {parseFloat(game.spread) > 0 ? '+' : ''}{game.spread}</div>)}
            </div>
          );
        })}
      </div>
    </CardContent>
  </Card>
);

const NextGameCard = ({ nextGame, teamId, getOpponent, formatGameTime }: any) => {
  const opponent = getOpponent(nextGame);
  const isHome = nextGame.homeTeamId === teamId;
  
  return (
    <Link href={`/games/${nextGame.id}`}>
      <a className="block outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader><CardTitle>Next Game Prediction</CardTitle></CardHeader>
          <CardContent className="text-center space-y-3">
            <img src={opponent.logoUrl || ''} alt={opponent.name} className="w-16 h-16 mx-auto" />
            <h3 className="font-semibold text-lg hover:underline">{isHome ? 'vs' : '@'} {opponent.name}</h3>
            <p className="text-sm text-gray-500">{formatGameTime(nextGame.gameTime)}</p>
            
            <div className="space-y-2">
              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">
                {Math.round(nextGame.winProbability)}% Win Probability
              </Badge>
              {nextGame.expectedScore && (<div className="text-sm text-gray-600">Predicted Score: {nextGame.expectedScore.team}-{nextGame.expectedScore.opponent}</div>)}
              {nextGame.predictionConfidence && (<div className="text-xs text-gray-500">{Math.round(nextGame.predictionConfidence)}% confidence ({new Date().getFullYear()} data)</div>)}
              {isHome && (<div className="text-xs text-green-600">🏠 Home field advantage included</div>)}
            </div>
          </CardContent>
        </Card>
      </a>
    </Link>
  );
};

const TeamProfileSkeleton = () => (
    <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-8 w-32 mb-6" />
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
            <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
                <Skeleton className="w-16 h-16 rounded-full" />
                <div>
                <Skeleton className="h-7 w-48 mb-2" />
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-6 w-24" />
                </div>
            </div>
            <div className="text-right">
                <Skeleton className="h-10 w-16 mb-1" />
                <Skeleton className="h-4 w-24" />
            </div>
            </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full rounded-lg" />
            <Skeleton className="h-96 w-full rounded-lg" />
            </div>
            <div className="space-y-6">
            <Skeleton className="h-48 w-full rounded-lg" />
            </div>
        </div>
        </main>
    </div>
);

const TeamProfileError = ({ onBack }: { onBack: () => void }) => (
  <div className="min-h-screen bg-gray-50">
    <Navigation />
    <main className="text-center py-20">
      <h1 className="text-xl font-bold">Team Not Found</h1>
      <p className="text-gray-600">The team you're looking for could not be found.</p>
      <Button onClick={onBack} className="mt-4">Back to Teams</Button>
    </main>
  </div>
);