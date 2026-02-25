import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

interface PickHistory {
  season: number;
  week: number;
  totalPicks: number;
  correctPicks: number;
  accuracy: number;
  tiebreakerScore?: number;
  tiebreakerAccuracy?: number;
  submittedAt: string;
  picks: Array<{
    gameId: number;
    homeTeam: { name: string };
    awayTeam: { name: string };
    pickedTeam: { name: string };
    actualWinner?: { name: string };
    isCorrect?: boolean;
    confidenceLevel: number;
    personalNotes?: string;
    homeScore?: number;
    awayScore?: number;
  }>;
}

interface PickStats {
  overallAccuracy: number;
  totalPicks: number;
  totalCorrect: number;
  bestWeek: { week: number; season: number; accuracy: number };
  worstWeek: { week: number; season: number; accuracy: number };
  averageConfidence: number;
  highConfidenceAccuracy: number;
  lowConfidenceAccuracy: number;
  seasonStats: Array<{
    season: number;
    totalPicks: number;
    correctPicks: number;
    accuracy: number;
  }>;
}

export default function MyPicksHistoryPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [selectedSeason, setSelectedSeason] = useState<number>(new Date().getFullYear());

  const { data: pickHistory, isLoading: isLoadingHistory } = useQuery<PickHistory[]>({
    queryKey: ["/api/v1/picks/history", selectedSeason],
    enabled: isAuthenticated,
  });

  const { data: pickStats, isLoading: isLoadingStats } = useQuery<PickStats>({
    queryKey: ["/api/v1/picks/stats"],
    enabled: isAuthenticated,
  });

  const { data: availableSeasons } = useQuery<number[]>({
    queryKey: ["/api/v1/picks/available-seasons"],
    enabled: isAuthenticated,
  });

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 70) return 'text-green-600';
    if (accuracy >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAccuracyBadgeVariant = (accuracy: number) => {
    if (accuracy >= 70) return 'default';
    if (accuracy >= 60) return 'secondary';
    return 'destructive';
  };

  const currentYear = new Date().getFullYear();
  const seasons = availableSeasons || [currentYear, currentYear - 1, currentYear - 2];

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔒</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Login Required</h1>
            <p className="text-gray-600 mb-6">Please log in to view your pick history.</p>
            <Button onClick={() => navigate("/login")}>
              Log In
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (isLoadingHistory || isLoadingStats) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-32 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">My Pick History</h1>
              <p className="text-gray-600">Track your prediction accuracy and performance over time</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Season:</label>
                <Select
                  value={selectedSeason.toString()}
                  onValueChange={(value) => setSelectedSeason(parseInt(value))}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {seasons.map((season) => (
                      <SelectItem key={season} value={season.toString()}>
                        {season}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => navigate(`/picks/${currentYear}/12`)}>
                Make New Picks
              </Button>
            </div>
          </div>
        </div>

        {/* Overall Stats */}
        {pickStats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6 text-center">
                <div className={`text-3xl font-bold mb-2 ${getAccuracyColor(pickStats.overallAccuracy)}`}>
                  {pickStats.overallAccuracy.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">Overall Accuracy</div>
                <div className="text-xs text-gray-500 mt-1">
                  {pickStats.totalCorrect}/{pickStats.totalPicks} picks
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold text-green-600 mb-2">
                  {pickStats.bestWeek.accuracy.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">Best Week</div>
                <div className="text-xs text-gray-500 mt-1">
                  Week {pickStats.bestWeek.week}, {pickStats.bestWeek.season}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className={`text-3xl font-bold mb-2 ${getAccuracyColor(pickStats.highConfidenceAccuracy)}`}>
                  {pickStats.highConfidenceAccuracy.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">High Confidence</div>
                <div className="text-xs text-gray-500 mt-1">
                  Confidence 8-10
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold text-gray-900 mb-2">
                  {pickStats.averageConfidence.toFixed(1)}
                </div>
                <div className="text-sm text-gray-600">Avg Confidence</div>
                <div className="text-xs text-gray-500 mt-1">
                  Out of 10
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Season Performance Chart */}
        {pickStats && pickStats.seasonStats.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Season Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pickStats.seasonStats.map((season) => (
                  <div key={season.season} className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <span className="font-medium text-gray-900 w-16">{season.season}</span>
                      <Progress value={season.accuracy} className="w-48" />
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className={`font-semibold ${getAccuracyColor(season.accuracy)}`}>
                        {season.accuracy.toFixed(1)}%
                      </span>
                      <span className="text-sm text-gray-500">
                        ({season.correctPicks}/{season.totalPicks})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Weekly History */}
        <div className="space-y-6">
          {pickHistory && pickHistory.length > 0 ? (
            pickHistory.map((weekHistory) => (
              <Card key={`${weekHistory.season}-${weekHistory.week}`}>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>
                      Week {weekHistory.week}, {weekHistory.season}
                    </CardTitle>
                    <div className="flex items-center space-x-4">
                      <Badge variant={getAccuracyBadgeVariant(weekHistory.accuracy)}>
                        {weekHistory.accuracy.toFixed(1)}% ({weekHistory.correctPicks}/{weekHistory.totalPicks})
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {new Date(weekHistory.submittedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {weekHistory.picks.map((pick, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className={`w-3 h-3 rounded-full ${
                            pick.isCorrect === true ? 'bg-green-500' : 
                            pick.isCorrect === false ? 'bg-red-500' : 'bg-gray-400'
                          }`} />
                          <div>
                            <div className="font-medium text-gray-900">
                              {pick.awayTeam.name} @ {pick.homeTeam.name}
                            </div>
                            <div className="text-sm text-gray-600">
                              Picked: {pick.pickedTeam.name}
                              {pick.actualWinner && (
                                <span className="ml-2">
                                  • Winner: {pick.actualWinner.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-4">
                          {pick.homeScore !== null && pick.awayScore !== null && (
                            <span className="text-sm font-medium text-gray-700">
                              {pick.awayScore}-{pick.homeScore}
                            </span>
                          )}
                          <Badge variant="outline" className="text-xs">
                            Confidence: {pick.confidenceLevel}
                          </Badge>
                          {pick.personalNotes && (
                            <div className="text-xs text-gray-500 max-w-32 truncate" title={pick.personalNotes}>
                              📝 {pick.personalNotes}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {weekHistory.tiebreakerScore && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">
                          Tiebreaker Prediction: {weekHistory.tiebreakerScore} points
                        </span>
                        {weekHistory.tiebreakerAccuracy && (
                          <Badge variant="outline">
                            {weekHistory.tiebreakerAccuracy.toFixed(1)}% accuracy
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No pick history</h3>
              <p className="text-gray-600 mb-6">
                You haven't made any picks for the {selectedSeason} season yet.
              </p>
              <Button onClick={() => navigate(`/picks/${currentYear}/12`)}>
                Make Your First Picks
              </Button>
            </div>
          )}
        </div>

        {/* Insights */}
        {pickStats && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Performance Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Confidence Analysis</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">High Confidence (8-10):</span>
                      <span className={`text-sm font-medium ${getAccuracyColor(pickStats.highConfidenceAccuracy)}`}>
                        {pickStats.highConfidenceAccuracy.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Low Confidence (1-5):</span>
                      <span className={`text-sm font-medium ${getAccuracyColor(pickStats.lowConfidenceAccuracy)}`}>
                        {pickStats.lowConfidenceAccuracy.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Season Comparison</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Best Week:</span>
                      <span className="text-sm font-medium text-green-600">
                        {pickStats.bestWeek.accuracy.toFixed(1)}% (Week {pickStats.bestWeek.week})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Worst Week:</span>
                      <span className="text-sm font-medium text-red-600">
                        {pickStats.worstWeek.accuracy.toFixed(1)}% (Week {pickStats.worstWeek.week})
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}