// client/src/pages/HomePage.tsx

import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Navigation from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";

// --- TYPE DEFINITIONS ---
interface UserStats {
  weeklyRecord: { wins: number; losses: number; week: number } | null;
  seasonRecord: { wins: number; losses: number };
  currentRank: number | null;
}

interface CurrentWeek {
  season: number;
  week: number;
}

interface WeekGamesResponse {
  games: any[];
  completedGames: number;
  upcomingGames: number;
}

const LoggedInDashboard = () => {
  // Get current season dynamically
  const currentSeason = new Date().getFullYear();
  
  const { data: userStats, isLoading: isLoadingStats } = useQuery<UserStats>({
    queryKey: ['/api/v1/user/stats', currentSeason],
  });
  
  const { data: currentWeek, isLoading: isLoadingWeek } = useQuery<CurrentWeek>({
    queryKey: ['/api/v1/games/current-week'],
  });

  return (
    <>
      {/* Quick Stats */}
      {isLoadingStats || isLoadingWeek ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded animate-pulse mb-2"></div>
                <div className="h-3 bg-gray-200 rounded animate-pulse w-16"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : userStats ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-600">This Week</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[hsl(45,70%,25%)]">{userStats.weeklyRecord ? `${userStats.weeklyRecord.wins}-${userStats.weeklyRecord.losses}` : '0-0'}</div>
                <p className="text-xs text-gray-500">Week {userStats.weeklyRecord?.week || currentWeek?.week || '-'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-600">Season Record</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{userStats.seasonRecord.wins}-{userStats.seasonRecord.losses}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-600">Current Rank</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">#{userStats.currentRank || '-'}</div>
              </CardContent>
            </Card>
          </div>
      ) : null}
      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <ActionCard 
          href={`/picks/${currentSeason}/${currentWeek?.week || 12}`} 
          title="Weekly Picks" 
          description="Analyze and make your weekly picks" 
          icon="🎯" 
        />
        <ActionCard 
          href={`/predictions/${currentSeason}/${currentWeek?.week || 12}`} 
          title="Predictions" 
          description="View statistical predictions" 
          icon="📊" 
        />
        <ActionCard 
          href={`/games/${currentSeason}`} 
          title="Browse Games" 
          description="Navigate historical and future games" 
          icon="📅" 
        />
        <ActionCard 
          href="/my-picks" 
          title="My History" 
          description="Track your prediction accuracy" 
          icon="📈" 
        />
      </div>
    </>
  );
};

const LoggedOutSplash = () => (
  <div className="text-center py-16">
    <h1 className="text-5xl font-bold text-gray-900 mb-6">College Pick'em</h1>
    <p className="text-2xl text-[hsl(45,70%,25%)] font-semibold mb-4">Statistical Analysis Platform</p>
    <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
      Make informed weekly picks using sophisticated relative performance analysis across all game phases.
    </p>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
        <FeatureCard 
          title="Relative Performance Analysis" 
          description="Analyze how teams perform against opponents relative to those opponents' typical performance." 
          icon="📊" 
        />
        <FeatureCard 
          title="Weekly Pick Analysis" 
          description="Process 10 weekly games with detailed statistical breakdowns and personal judgment integration." 
          icon="🎯" 
        />
        <FeatureCard 
          title="Historical Navigation" 
          description="Browse through seasons and weeks to analyze past performance and trends." 
          icon="📈" 
        />
    </div>
  </div>
);

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:g:px-8 py-8">
        {isAuthenticated ? <LoggedInDashboard /> : <LoggedOutSplash />}
      </main>
    </div>
  );
}

// Helper components for cleaner code
const ActionCard = ({ href, title, description, icon }: { href: string, title: string, description: string, icon: string }) => (
  <Link href={href} className="block">
    <Card className="hover:shadow-lg transition-shadow h-full">
      <CardContent className="p-6 text-center">
        <div className="text-4xl mb-4">{icon}</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600">{description}</p>
      </CardContent>
    </Card>
  </Link>
);

const FeatureCard = ({ title, description, icon }: { title: string, description: string, icon: string }) => (
    <Card className="text-center bg-white">
        <CardHeader><div className="text-4xl mb-4">{icon}</div><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent><p className="text-gray-600">{description}</p></CardContent>
    </Card>
);