import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "react-hot-toast";

import Navigation from "@/components/Navigation";
import GameCard, { PickUpdate } from "@/components/GameCard";
import { useAuth } from "@/hooks/useAuth";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { EnrichedGame } from "@college-pickem/shared";

// --- API Helper Functions ---

const fetchCurrentWeek = async (): Promise<{ season: number; week: number }> => {
  const res = await fetch("/api/v1/games/current-week");
  if (!res.ok) throw new Error("Failed to fetch current week");
  return res.json();
};

const fetchFilterData = async (): Promise<{ 
  seasonsAndWeeks: Record<string, number[]>; 
  conferences: string[];
  hierarchy?: { classifications: string[]; conferencesByClassification: Record<string, string[]> };
}> => {
  const [seasonsRes, confsRes] = await Promise.all([
    fetch("/api/v1/games/filters"),
    fetch("/api/v1/teams/conferences"),
  ]);
  if (!seasonsRes.ok || !confsRes.ok) throw new Error("Failed to load filter data");
  const seasonsAndWeeks = await seasonsRes.json();
  const conferences = await confsRes.json();
  
  let hierarchy = undefined;
  try {
    const hierarchyRes = await fetch("/api/v1/teams/filter-hierarchy");
    if (hierarchyRes.ok) {
      hierarchy = await hierarchyRes.json();
    }
  } catch (error) {
    console.warn("Failed to load hierarchy data, falling back to simple conference list");
  }
  
  return { seasonsAndWeeks, conferences, hierarchy };
};

// =============================================================================
// START: CORRECTED FUNCTION
// =============================================================================
const fetchHubData = async (
  season: number, 
  week: number, 
  filterValue: string, 
  classifications: string[] = [] // Pass known classifications to help decide
): Promise<{ games: EnrichedGame[] }> => {
  let queryParams = '';

  if (filterValue !== 'all') {
    // Check if the selected value is a classification (like FBS, FCS)
    if (classifications.includes(filterValue)) {
      queryParams = `&classification=${encodeURIComponent(filterValue)}`;
    } else {
      // Otherwise, assume it's a conference
      queryParams = `&conference=${encodeURIComponent(filterValue)}`;
    }
  }

  const res = await fetch(`/api/v1/games/hub?season=${season}&week=${week}${queryParams}`);
  if (!res.ok) throw new Error("Failed to fetch week's games");
  return res.json();
};
// =============================================================================
// END: CORRECTED FUNCTION
// =============================================================================


const savePicks = async (picks: PickUpdate[]) => {
  const res = await fetch('/api/v1/picks/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ picks }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || 'Failed to save picks');
  }
  return res.json();
};

const toggleFeaturedGame = async (gameId: number, isFeatured: boolean) => {
  const res = await fetch(`/api/v1/games/${gameId}/featured`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isFeaturedGame: isFeatured }),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || 'Failed to update featured status');
  }
  return res.json();
};

// --- Component ---

export default function GamesPage() {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth(); // Assuming user object has roles
  const isAdmin = user?.role === 'admin';

  // State for managing unsaved user picks
  const [localPicks, setLocalPicks] = useState<Map<number, PickUpdate>>(new Map());
  const isDirty = useMemo(() => localPicks.size > 0, [localPicks]);

  // --- Data Fetching ---

  const { data: currentWeekData } = useQuery({
    queryKey: ["currentWeek"],
    queryFn: fetchCurrentWeek,
    staleTime: 5 * 60 * 1000,
  });

  const { data: filterData, isLoading: isLoadingFilters } = useQuery({
    queryKey: ["allFilters"],
    queryFn: fetchFilterData,
    staleTime: Infinity,
  });

  // Use persisted filters hook
  const {
    season: selectedSeason,
    week: selectedWeek,
    conference: selectedConference,
    featuredOnly: showFeaturedOnly,
    setSeason: setSelectedSeason,
    setWeek: setSelectedWeek,
    setConference: setSelectedConference,
    setFeaturedOnly: setShowFeaturedOnly,
  } = usePersistedFilters({
    currentWeek: currentWeekData,
    availableSeasons: filterData?.seasonsAndWeeks,
    availableConferences: filterData?.conferences,
    availableClassifications: filterData?.hierarchy?.classifications,
    isAdmin,
  });

  const hubDataQuery = useQuery({
    queryKey: ["hubData", selectedSeason, selectedWeek, selectedConference],
    queryFn: () => fetchHubData(
      selectedSeason!, 
      selectedWeek!, 
      selectedConference, 
      filterData?.hierarchy?.classifications // Pass classifications to the fetcher
    ),
    enabled: !!selectedSeason && !!selectedWeek && !!filterData,
  });
  
  const savePicksMutation = useMutation({
    mutationFn: savePicks,
    onSuccess: () => {
      toast.success("Picks saved successfully!");
      setLocalPicks(new Map());
      queryClient.invalidateQueries({ queryKey: ["hubData", selectedSeason, selectedWeek, selectedConference] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleFeaturedMutation = useMutation({
    mutationFn: ({ gameId, isFeatured }: { gameId: number; isFeatured: boolean }) => 
      toggleFeaturedGame(gameId, isFeatured),
    onSuccess: () => {
      toast.success("Featured status updated!");
      queryClient.invalidateQueries({ queryKey: ["hubData", selectedSeason, selectedWeek, selectedConference] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // --- Effects ---

  useEffect(() => {
    setLocalPicks(new Map());
  }, [hubDataQuery.data]);

  // --- Event Handlers ---
  
  const handleSeasonChange = (seasonStr: string) => {
    const newSeason = parseInt(seasonStr, 10);
    setSelectedSeason(newSeason);
    // The hook will automatically handle setting the week to the first available week for the new season
  };

  const handlePickChange = (gameId: number, update: PickUpdate) => {
    setLocalPicks(prev => {
      const newPicks = new Map(prev);
      const existing = newPicks.get(gameId) || { gameId };
      newPicks.set(gameId, { ...existing, ...update });
      return newPicks;
    });
  };

  const handleSavePicks = () => {
    savePicksMutation.mutate(Array.from(localPicks.values()));
  };

  const handleFeaturedToggle = (gameId: number, isFeatured: boolean) => {
    toggleFeaturedMutation.mutate({ gameId, isFeatured });
  };

  // --- Derived Data ---
  const filteredGames = useMemo(() => {
    if (!hubDataQuery.data?.games) return [];
    return hubDataQuery.data.games.filter(game => !showFeaturedOnly || game.isFeaturedGame);
  }, [hubDataQuery.data, showFeaturedOnly]);

  const availableWeeks = selectedSeason ? filterData?.seasonsAndWeeks[selectedSeason] || [] : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Games Hub</h2>
          <p className="text-gray-600">View games, see predictions, and make your picks.</p>
        </div>

        <div className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-sm -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-6 border-b">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 items-center">
            {isLoadingFilters ? (
              <>
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-48" />
              </>
            ) : (
              <>
                <Select value={String(selectedSeason)} onValueChange={handleSeasonChange}>
                  <SelectTrigger className="w-full md:w-[120px]"><SelectValue placeholder="Season" /></SelectTrigger>
                  <SelectContent>
                    {filterData?.seasonsAndWeeks && Object.keys(filterData.seasonsAndWeeks).sort((a,b) => Number(b)-Number(a)).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(selectedWeek)} onValueChange={(w) => setSelectedWeek(parseInt(w, 10))} disabled={!selectedSeason}>
                  <SelectTrigger className="w-full md:w-[100px]"><SelectValue placeholder="Week" /></SelectTrigger>
                  <SelectContent>
                    {availableWeeks.map(w => <SelectItem key={w} value={String(w)}>Week {w}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={selectedConference} onValueChange={setSelectedConference}>
                  <SelectTrigger className="w-full md:w-[200px]"><SelectValue placeholder="Conference" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Teams</SelectItem>
                    {filterData?.hierarchy ? (
                      <>
                        {filterData.hierarchy.classifications.map(classification => (
                          <SelectItem key={classification} value={classification}>
                            {classification}
                          </SelectItem>
                        ))}
                        <SelectItem disabled value="separator">──────────</SelectItem>
                        {Object.entries(filterData.hierarchy.conferencesByClassification).map(([classification, confs]) => 
                          confs.map(conference => (
                            <SelectItem key={`${classification}-${conference}`} value={conference}>
                              {conference}
                            </SelectItem>
                          ))
                        )}
                      </>
                    ) : (
                      filterData?.conferences.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)
                    )}
                  </SelectContent>
                </Select>
              </>
            )}
            <div className="flex-grow" />
            {isAdmin && (
              <div className="flex items-center space-x-2">
                <Switch id="featured-only" checked={showFeaturedOnly} onCheckedChange={setShowFeaturedOnly} />
                <Label htmlFor="featured-only">Featured</Label>
              </div>
            )}
            <Button onClick={handleSavePicks} disabled={!isDirty || savePicksMutation.isPending}>
              {savePicksMutation.isPending ? "Saving..." : "Save Picks"}
            </Button>
          </div>
        </div>

        {hubDataQuery.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}
          </div>
        ) : hubDataQuery.isError ? (
          <div className="text-center py-12"><p className="text-red-600">Error loading games. Please try again.</p></div>
        ) : filteredGames.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGames.map((game: EnrichedGame) => (
              <GameCard
                key={game.id}
                game={game}
                userPick={game.userPick}
                localPickUpdate={localPicks.get(game.id)}
                onPickChange={(update) => handlePickChange(game.id, update)}
                onFeaturedToggle={isAdmin ? handleFeaturedToggle : undefined}
                isAuthenticated={isAuthenticated}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Games Found</h3>
            <p className="text-gray-600">There are no games matching your filter criteria.</p>
          </div>
        )}
      </main>
    </div>
  );
}