import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TeamComparison {
  teamA: {
    id: number;
    name: string;
    conference: string;
    record: { wins: number; losses: number };
    strengthRatings: {
      passOffenseStrength: number;
      rushOffenseStrength: number;
      passDefenseStrength: number;
      rushDefenseStrength: number;
      scoringOffenseStrength: number;
      scoringDefenseStrength: number;
      specialTeamsStrength: number;
      overallOffensiveRating: number;
      overallDefensiveRating: number;
      strengthOfSchedule: number;
    };
  };
  teamB: {
    id: number;
    name: string;
    conference: string;
    record: { wins: number; losses: number };
    strengthRatings: {
      passOffenseStrength: number;
      rushOffenseStrength: number;
      passDefenseStrength: number;
      rushDefenseStrength: number;
      scoringOffenseStrength: number;
      scoringDefenseStrength: number;
      specialTeamsStrength: number;
      overallOffensiveRating: number;
      overallDefensiveRating: number;
      strengthOfSchedule: number;
    };
  };
  headToHead: {
    prediction: {
      predictedWinner: number;
      confidence: number;
      expectedScore: { teamA: number; teamB: number };
      winProbability: { teamA: number; teamB: number };
    };
    keyMatchups: Array<{
      category: string;
      advantage: number;
      favoredTeam: number;
      explanation: string;
    }>;
    historicalRecord: {
      teamAWins: number;
      teamBWins: number;
      recentGames: Array<{
        season: number;
        teamAScore: number;
        teamBScore: number;
        date: string;
      }>;
    };
  };
}

export default function TeamComparisonPage() {
  const { teamId, opponentId } = useParams();
  const [, navigate] = useLocation();

  const { data: comparison, isLoading, error } = useQuery<TeamComparison>({
    queryKey: ["/api/v1/teams", teamId, "vs", opponentId],
    enabled: !!teamId && !!opponentId,
  });

  const getTeamInitial = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
  };

  const getTeamColorFromName = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['bg-red-600', 'bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-orange-600', 'bg-indigo-600'];
    return colors[Math.abs(hash) % colors.length];
  };

  const getAdvantageColor = (advantage: number) => {
    if (advantage > 10) return 'text-green-600';
    if (advantage > 5) return 'text-green-500';
    if (advantage > 0) return 'text-yellow-600';
    if (advantage > -5) return 'text-yellow-500';
    if (advantage > -10) return 'text-red-500';
    return 'text-red-600';
  };

  const formatAdvantage = (advantage: number) => {
    const sign = advantage > 0 ? '+' : '';
    return `${sign}${advantage.toFixed(1)}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <Skeleton className="h-32 w-full" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !comparison) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Comparison Not Available</h1>
            <p className="text-gray-600 mb-6">Unable to load comparison data for these teams.</p>
            <Button onClick={() => navigate("/teams")}>
              Back to Teams
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const { teamA, teamB, headToHead } = comparison;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => window.history.back()}
          className="mb-6"
        >
          ← Back
        </Button>

        {/* Comparison Header */}
        <Card className="mb-8">
          <CardContent className="p-8">
            <div className="flex items-center justify-between">
              {/* Team A */}
              <div className="flex items-center space-x-6">
                <div className={`w-20 h-20 ${getTeamColorFromName(teamA.name)} rounded-full flex items-center justify-center text-white text-2xl font-bold`}>
                  {getTeamInitial(teamA.name)}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{teamA.name}</h2>
                  <p className="text-gray-600">{teamA.conference}</p>
                  <Badge className="bg-green-100 text-green-800 mt-1">
                    {teamA.record.wins}-{teamA.record.losses}
                  </Badge>
                </div>
              </div>

              {/* Prediction */}
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900 mb-2">
                  {headToHead.prediction.expectedScore.teamA} - {headToHead.prediction.expectedScore.teamB}
                </div>
                <div className="text-sm text-gray-600 mb-2">Predicted Score</div>
                <Badge className="bg-blue-100 text-blue-800">
                  {headToHead.prediction.confidence}% Confidence
                </Badge>
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>{teamA.name}: {headToHead.prediction.winProbability.teamA}%</span>
                    <span>{teamB.name}: {headToHead.prediction.winProbability.teamB}%</span>
                  </div>
                  <Progress value={headToHead.prediction.winProbability.teamB} className="h-3" />
                </div>
              </div>

              {/* Team B */}
              <div className="flex items-center space-x-6">
                <div className="text-right">
                  <h2 className="text-2xl font-bold text-gray-900">{teamB.name}</h2>
                  <p className="text-gray-600">{teamB.conference}</p>
                  <Badge className="bg-green-100 text-green-800 mt-1">
                    {teamB.record.wins}-{teamB.record.losses}
                  </Badge>
                </div>
                <div className={`w-20 h-20 ${getTeamColorFromName(teamB.name)} rounded-full flex items-center justify-center text-white text-2xl font-bold`}>
                  {getTeamInitial(teamB.name)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="strengths" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="strengths">Strength Comparison</TabsTrigger>
            <TabsTrigger value="matchups">Key Matchups</TabsTrigger>
            <TabsTrigger value="history">Head-to-Head</TabsTrigger>
            <TabsTrigger value="schedule">Schedule Strength</TabsTrigger>
          </TabsList>

          <TabsContent value="strengths" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Offensive Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle>Offensive Comparison</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Pass Offense</span>
                      <span>{teamA.strengthRatings.passOffenseStrength.toFixed(1)} vs {teamB.strengthRatings.passOffenseStrength.toFixed(1)}</span>
                    </div>
                    <div className="flex space-x-2">
                      <Progress value={teamA.strengthRatings.passOffenseStrength} className="flex-1" />
                      <Progress value={teamB.strengthRatings.passOffenseStrength} className="flex-1" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Rush Offense</span>
                      <span>{teamA.strengthRatings.rushOffenseStrength.toFixed(1)} vs {teamB.strengthRatings.rushOffenseStrength.toFixed(1)}</span>
                    </div>
                    <div className="flex space-x-2">
                      <Progress value={teamA.strengthRatings.rushOffenseStrength} className="flex-1" />
                      <Progress value={teamB.strengthRatings.rushOffenseStrength} className="flex-1" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Scoring Offense</span>
                      <span>{teamA.strengthRatings.scoringOffenseStrength.toFixed(1)} vs {teamB.strengthRatings.scoringOffenseStrength.toFixed(1)}</span>
                    </div>
                    <div className="flex space-x-2">
                      <Progress value={teamA.strengthRatings.scoringOffenseStrength} className="flex-1" />
                      <Progress value={teamB.strengthRatings.scoringOffenseStrength} className="flex-1" />
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
                      <span>Overall Offensive Rating</span>
                      <span className={teamA.strengthRatings.overallOffensiveRating > teamB.strengthRatings.overallOffensiveRating ? 'text-green-600' : 'text-red-600'}>
                        {teamA.strengthRatings.overallOffensiveRating.toFixed(1)}
                      </span>
                      <span className={teamB.strengthRatings.overallOffensiveRating > teamA.strengthRatings.overallOffensiveRating ? 'text-green-600' : 'text-red-600'}>
                        {teamB.strengthRatings.overallOffensiveRating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Defensive Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle>Defensive Comparison</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Pass Defense</span>
                      <span>{teamA.strengthRatings.passDefenseStrength.toFixed(1)} vs {teamB.strengthRatings.passDefenseStrength.toFixed(1)}</span>
                    </div>
                    <div className="flex space-x-2">
                      <Progress value={teamA.strengthRatings.passDefenseStrength} className="flex-1" />
                      <Progress value={teamB.strengthRatings.passDefenseStrength} className="flex-1" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Rush Defense</span>
                      <span>{teamA.strengthRatings.rushDefenseStrength.toFixed(1)} vs {teamB.strengthRatings.rushDefenseStrength.toFixed(1)}</span>
                    </div>
                    <div className="flex space-x-2">
                      <Progress value={teamA.strengthRatings.rushDefenseStrength} className="flex-1" />
                      <Progress value={teamB.strengthRatings.rushDefenseStrength} className="flex-1" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Scoring Defense</span>
                      <span>{teamA.strengthRatings.scoringDefenseStrength.toFixed(1)} vs {teamB.strengthRatings.scoringDefenseStrength.toFixed(1)}</span>
                    </div>
                    <div className="flex space-x-2">
                      <Progress value={teamA.strengthRatings.scoringDefenseStrength} className="flex-1" />
                      <Progress value={teamB.strengthRatings.scoringDefenseStrength} className="flex-1" />
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
                      <span>Overall Defensive Rating</span>
                      <span className={teamA.strengthRatings.overallDefensiveRating > teamB.strengthRatings.overallDefensiveRating ? 'text-green-600' : 'text-red-600'}>
                        {teamA.strengthRatings.overallDefensiveRating.toFixed(1)}
                      </span>
                      <span className={teamB.strengthRatings.overallDefensiveRating > teamA.strengthRatings.overallDefensiveRating ? 'text-green-600' : 'text-red-600'}>
                        {teamB.strengthRatings.overallDefensiveRating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="matchups" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {headToHead.keyMatchups.map((matchup, index) => (
                <Card key={index}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {matchup.category}
                      <Badge className={getAdvantageColor(matchup.advantage)}>
                        {matchup.favoredTeam === teamA.id ? teamA.name : teamB.name} {formatAdvantage(Math.abs(matchup.advantage))}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600">
                      {matchup.explanation}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Overall Record */}
              <Card>
                <CardHeader>
                  <CardTitle>All-Time Record</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-4xl font-bold text-gray-900 mb-2">
                    {headToHead.historicalRecord.teamAWins} - {headToHead.historicalRecord.teamBWins}
                  </div>
                  <div className="text-sm text-gray-600">
                    {teamA.name} vs {teamB.name}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Games */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Recent Matchups</CardTitle>
                </CardHeader>
                <CardContent>
                  {headToHead.historicalRecord.recentGames.length > 0 ? (
                    <div className="space-y-3">
                      {headToHead.historicalRecord.recentGames.map((game, index) => (
                        <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm text-gray-600">{game.season} Season</span>
                          <span className="font-medium">
                            {teamA.name} {game.teamAScore} - {game.teamBScore} {teamB.name}
                          </span>
                          <span className="text-sm text-gray-600">
                            {new Date(game.date).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="text-4xl mb-4">📊</div>
                      <p className="text-gray-600">No recent matchup data available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>{teamA.name} Schedule Strength</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center mb-4">
                    <div className="text-4xl font-bold text-gray-900 mb-2">
                      {teamA.strengthRatings.strengthOfSchedule.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-600">Strength of Schedule Rating</div>
                  </div>
                  <Progress value={teamA.strengthRatings.strengthOfSchedule * 10} className="mb-4" />
                  <p className="text-sm text-gray-600">
                    This rating reflects the average strength of opponents faced this season, 
                    adjusted for their performance against other teams.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{teamB.name} Schedule Strength</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center mb-4">
                    <div className="text-4xl font-bold text-gray-900 mb-2">
                      {teamB.strengthRatings.strengthOfSchedule.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-600">Strength of Schedule Rating</div>
                  </div>
                  <Progress value={teamB.strengthRatings.strengthOfSchedule * 10} className="mb-4" />
                  <p className="text-sm text-gray-600">
                    This rating reflects the average strength of opponents faced this season, 
                    adjusted for their performance against other teams.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Quick Actions */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Button
                variant="outline"
                onClick={() => navigate(`/teams/${teamA.id}`)}
              >
                View {teamA.name} Profile
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`/teams/${teamB.id}`)}
              >
                View {teamB.name} Profile
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`/predictions/${new Date().getFullYear()}/12`)}
              >
                View Weekly Predictions
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`/picks/${new Date().getFullYear()}/12`)}
              >
                Make Weekly Picks
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}