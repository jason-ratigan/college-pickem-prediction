import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";

interface TeamEfficiencyRanking {
  teamId: number;
  teamName: string;
  conference: string;
  classification: string;
  passOffenseEfficiency: number;
  rushOffenseEfficiency: number;
  scoringOffenseEfficiency: number;
  passDefenseEfficiency: number;
  rushDefenseEfficiency: number;
  scoringDefenseEfficiency: number;
  turnoverEfficiency: number;
  specialTeamsEfficiency: number;
  gamesPlayed: number;
  dataQuality: string;
  // Rankings for each category
  passOffenseRank: number;
  rushOffenseRank: number;
  scoringOffenseRank: number;
  passDefenseRank: number;
  rushDefenseRank: number;
  scoringDefenseRank: number;
  turnoverRank: number;
  specialTeamsRank: number;
  overallRank: number;
}

type SortField = keyof TeamEfficiencyRanking;
type SortDirection = 'asc' | 'desc';

const fetchTeamRankings = async (season: number): Promise<TeamEfficiencyRanking[]> => {
  const res = await fetch(`/api/v1/teams/rankings/${season}`);
  if (!res.ok) throw new Error("Failed to fetch team rankings");
  return res.json();
};

export default function TeamRankingsPage() {
  const [selectedSeason, setSelectedSeason] = useState<number>(2024);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('overallRank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterClassification, setFilterClassification] = useState<string>('all');

  const { data: rankings, isLoading, error } = useQuery({
    queryKey: ["teamRankings", selectedSeason],
    queryFn: () => fetchTeamRankings(selectedSeason),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
  };

  const filteredAndSortedRankings = useMemo(() => {
    if (!rankings) return [];
    
    let filtered = rankings.filter(team => {
      const matchesSearch = team.teamName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           team.conference.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesClassification = filterClassification === 'all' || team.classification.toLowerCase() === filterClassification.toLowerCase();
      return matchesSearch && matchesClassification;
    });

    return filtered.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      return 0;
    });
  }, [rankings, searchTerm, filterClassification, sortField, sortDirection]);

  const getEfficiencyColor = (efficiency: number, isDefense: boolean = false) => {
    // For defense, negative is better (less points/yards allowed)
    const adjustedEfficiency = isDefense ? -efficiency : efficiency;
    
    if (adjustedEfficiency >= 10) return "text-green-700 font-bold";
    if (adjustedEfficiency >= 5) return "text-green-600";
    if (adjustedEfficiency >= 0) return "text-gray-700";
    if (adjustedEfficiency >= -5) return "text-orange-600";
    return "text-red-600";
  };

  const getRankColor = (rank: number, total: number) => {
    const percentile = rank / total;
    if (percentile <= 0.1) return "text-green-700 font-bold"; // Top 10%
    if (percentile <= 0.25) return "text-green-600"; // Top 25%
    if (percentile <= 0.5) return "text-gray-700"; // Top 50%
    if (percentile <= 0.75) return "text-orange-600"; // Top 75%
    return "text-red-600"; // Bottom 25%
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !rankings) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h1 className="text-xl font-bold text-red-600">Error Loading Rankings</h1>
            <p className="text-gray-600">Failed to load team efficiency rankings.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Team Efficiency Rankings</h2>
          <p className="text-gray-600">Compare team performance across all statistical categories with opponent-adjusted efficiency ratings.</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <Select value={String(selectedSeason)} onValueChange={(s) => setSelectedSeason(parseInt(s))}>
              <SelectTrigger className="w-full md:w-[120px]">
                <SelectValue placeholder="Season" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
                <SelectItem value="2022">2022</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterClassification} onValueChange={setFilterClassification}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Division" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Divisions</SelectItem>
                <SelectItem value="FBS">FBS Only</SelectItem>
                <SelectItem value="FCS">FCS Only</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search teams or conferences..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="text-sm text-gray-600">
              Showing {filteredAndSortedRankings.length} of {rankings.length} teams
            </div>
          </div>
        </div>

        {/* Rankings Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                    <Button variant="ghost" size="sm" onClick={() => handleSort('overallRank')} className="h-auto p-0 font-medium">
                      Overall Rank {getSortIcon('overallRank')}
                    </Button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-16 bg-gray-50 z-10">
                    <Button variant="ghost" size="sm" onClick={() => handleSort('teamName')} className="h-auto p-0 font-medium">
                      Team {getSortIcon('teamName')}
                    </Button>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <Button variant="ghost" size="sm" onClick={() => handleSort('passOffenseRank')} className="h-auto p-0 font-medium">
                      Pass Off {getSortIcon('passOffenseRank')}
                    </Button>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <Button variant="ghost" size="sm" onClick={() => handleSort('rushOffenseRank')} className="h-auto p-0 font-medium">
                      Rush Off {getSortIcon('rushOffenseRank')}
                    </Button>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <Button variant="ghost" size="sm" onClick={() => handleSort('scoringOffenseRank')} className="h-auto p-0 font-medium">
                      Scoring Off {getSortIcon('scoringOffenseRank')}
                    </Button>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <Button variant="ghost" size="sm" onClick={() => handleSort('passDefenseRank')} className="h-auto p-0 font-medium">
                      Pass Def {getSortIcon('passDefenseRank')}
                    </Button>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <Button variant="ghost" size="sm" onClick={() => handleSort('rushDefenseRank')} className="h-auto p-0 font-medium">
                      Rush Def {getSortIcon('rushDefenseRank')}
                    </Button>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <Button variant="ghost" size="sm" onClick={() => handleSort('scoringDefenseRank')} className="h-auto p-0 font-medium">
                      Scoring Def {getSortIcon('scoringDefenseRank')}
                    </Button>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <Button variant="ghost" size="sm" onClick={() => handleSort('turnoverRank')} className="h-auto p-0 font-medium">
                      Turnovers {getSortIcon('turnoverRank')}
                    </Button>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <Button variant="ghost" size="sm" onClick={() => handleSort('specialTeamsRank')} className="h-auto p-0 font-medium">
                      Special Teams {getSortIcon('specialTeamsRank')}
                    </Button>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <Button variant="ghost" size="sm" onClick={() => handleSort('dataQuality')} className="h-auto p-0 font-medium">
                      Data Quality {getSortIcon('dataQuality')}
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAndSortedRankings.map((team, index) => (
                  <tr key={team.teamId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium sticky left-0 bg-inherit z-10">
                      <span className={getRankColor(team.overallRank, rankings.length)}>
                        #{team.overallRank}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap sticky left-16 bg-inherit z-10">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{team.teamName}</div>
                        <div className="text-xs text-gray-500">{team.conference}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                      <div className={getRankColor(team.passOffenseRank, rankings.length)}>
                        #{team.passOffenseRank}
                      </div>
                      <div className={getEfficiencyColor(team.passOffenseEfficiency)}>
                        {team.passOffenseEfficiency.toFixed(1)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                      <div className={getRankColor(team.rushOffenseRank, rankings.length)}>
                        #{team.rushOffenseRank}
                      </div>
                      <div className={getEfficiencyColor(team.rushOffenseEfficiency)}>
                        {team.rushOffenseEfficiency.toFixed(1)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                      <div className={getRankColor(team.scoringOffenseRank, rankings.length)}>
                        #{team.scoringOffenseRank}
                      </div>
                      <div className={getEfficiencyColor(team.scoringOffenseEfficiency)}>
                        {team.scoringOffenseEfficiency.toFixed(1)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                      <div className={getRankColor(team.passDefenseRank, rankings.length)}>
                        #{team.passDefenseRank}
                      </div>
                      <div className={getEfficiencyColor(team.passDefenseEfficiency, true)}>
                        {team.passDefenseEfficiency.toFixed(1)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                      <div className={getRankColor(team.rushDefenseRank, rankings.length)}>
                        #{team.rushDefenseRank}
                      </div>
                      <div className={getEfficiencyColor(team.rushDefenseEfficiency, true)}>
                        {team.rushDefenseEfficiency.toFixed(1)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                      <div className={getRankColor(team.scoringDefenseRank, rankings.length)}>
                        #{team.scoringDefenseRank}
                      </div>
                      <div className={getEfficiencyColor(team.scoringDefenseEfficiency, true)}>
                        {team.scoringDefenseEfficiency.toFixed(1)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                      <div className={getRankColor(team.turnoverRank, rankings.length)}>
                        #{team.turnoverRank}
                      </div>
                      <div className={getEfficiencyColor(team.turnoverEfficiency)}>
                        {team.turnoverEfficiency.toFixed(1)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                      <div className={getRankColor(team.specialTeamsRank, rankings.length)}>
                        #{team.specialTeamsRank}
                      </div>
                      <div className={getEfficiencyColor(team.specialTeamsEfficiency)}>
                        {team.specialTeamsEfficiency.toFixed(1)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <Badge variant={
                        team.dataQuality === 'Excellent' ? 'default' :
                        team.dataQuality === 'Good' ? 'secondary' :
                        team.dataQuality === 'Limited' ? 'outline' : 'destructive'
                      }>
                        {team.dataQuality}
                      </Badge>
                      <div className="text-xs text-gray-500 mt-1">
                        {team.gamesPlayed} games
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredAndSortedRankings.length === 0 && (
          <div className="text-center py-12">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Teams Found</h3>
            <p className="text-gray-600">No teams match your current filter criteria.</p>
          </div>
        )}
      </main>
    </div>
  );
}