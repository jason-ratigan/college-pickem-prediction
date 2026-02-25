import { Link } from "wouter"; // FIX: Import Link
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { TeamSelect, TeamStrengthRatings } from "@college-pickem/shared";

interface TeamCardProps {
  team: TeamSelect;
  strengthRatings?: TeamStrengthRatings;
  record?: { wins: number; losses: number };
  nextGame?: {
    opponent: TeamSelect;
    isHome: boolean;
    gameTime: Date | null;
    winProbability?: number;
  };
  // FIX: Removed onClick, as the component will now handle its own navigation
}

export default function TeamCard({ team, strengthRatings, record, nextGame }: TeamCardProps) {
  const getTeamInitial = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
  };

  const getTeamColorFromName = (name: string) => {
    // Simple hash function to generate consistent colors
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['bg-red-600', 'bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-orange-600', 'bg-indigo-600'];
    return colors[Math.abs(hash) % colors.length];
  };

  const formatGameTime = (gameTime: Date | null) => {
    if (!gameTime) return '';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(gameTime));
  };

  return (
    // FIX: Wrap the entire card in a Link component.
    <Link href={`/teams/${team.id}`}>
      {/* The `a` tag makes the entire block a single, accessible link */}
      <a className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg block">
        <Card 
          className="hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1"
          data-testid={`card-team-${team.id}`}
        >
          <CardContent className="p-6">
            {/* Team Header */}
            <div className="flex items-center mb-4">
              <div className={`w-12 h-12 ${getTeamColorFromName(team.name)} rounded-full flex items-center justify-center text-white font-bold mr-4`}>
                {getTeamInitial(team.name)}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900" data-testid={`text-team-name-${team.id}`}>
                  {team.name}
                </h3>
                <p className="text-sm text-gray-500" data-testid={`text-team-conference-${team.id}`}>
                  {team.conference || 'Independent'}
                </p>
              </div>
              {record && (
                <div className="ml-auto">
                  <Badge 
                    variant={record.wins > record.losses ? "default" : "secondary"}
                    className="bg-green-100 text-green-800"
                    data-testid={`badge-team-record-${team.id}`}
                  >
                    ↑ {record.wins}-{record.losses}
                  </Badge>
                </div>
              )}
            </div>

            {/* Strength Ratings */}
            {strengthRatings && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Strength Ratings (Opponent-Adjusted)</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Offense</span>
                    <div className="flex items-center">
                      <Progress
                        value={parseFloat(strengthRatings.offenseRatingAdjusted || "0")}
                        className="w-20 mr-2"
                        data-testid={`progress-offense-${team.id}`}
                      />
                      <span className="text-sm font-medium text-gray-900 w-8" data-testid={`text-offense-rating-${team.id}`}>
                        {Math.round(parseFloat(strengthRatings.offenseRatingAdjusted || "0"))}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Defense</span>
                    <div className="flex items-center">
                      <Progress
                        value={parseFloat(strengthRatings.defenseRatingAdjusted || "0")}
                        className="w-20 mr-2"
                        data-testid={`progress-defense-${team.id}`}
                      />
                      <span className="text-sm font-medium text-gray-900 w-8" data-testid={`text-defense-rating-${team.id}`}>
                        {Math.round(parseFloat(strengthRatings.defenseRatingAdjusted || "0"))}
                      </span>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* Next Game Preview */}
            {nextGame && (
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Next Game</h4>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600" data-testid={`text-next-opponent-${team.id}`}>
                    {nextGame.isHome ? 'vs' : '@'} {nextGame.opponent.name}
                  </span>
                  <span className="text-xs text-gray-500" data-testid={`text-next-game-time-${team.id}`}>
                    {formatGameTime(nextGame.gameTime)}
                  </span>
                </div>
                {nextGame.winProbability && (
                  <div className="mt-2">
                    <Badge 
                      variant={nextGame.winProbability > 60 ? "default" : "secondary"}
                      className={nextGame.winProbability > 60 ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}
                      data-testid={`badge-win-probability-${team.id}`}
                    >
                      👍 {Math.round(nextGame.winProbability)}% Win Probability
                    </Badge>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </a>
    </Link>
  );
}