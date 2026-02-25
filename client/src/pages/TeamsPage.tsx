// client/src/pages/TeamsPage.tsx

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QueryFunctionContext } from '@tanstack/react-query';
// FIX: No longer need Link or useLocation here
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Navigation from "@/components/Navigation";
import TeamCard from "@/components/TeamCard";
import { TeamSelect } from "@college-pickem/shared";

// --- API Helper Functions ---

const fetchConferences = async (): Promise<string[]> => {
  const res = await fetch('/api/v1/teams/conferences');
  if (!res.ok) throw new Error('Failed to fetch conferences');
  return res.json();
};

type TeamsQueryKey = [string, { search: string; conference: string }];
const fetchTeams = async (context: QueryFunctionContext<TeamsQueryKey>): Promise<TeamSelect[]> => {
  const [_key, params] = context.queryKey;
  
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.append('search', params.search);
  if (params.conference && params.conference !== 'all') searchParams.append('conference', params.conference);

  const res = await fetch(`/api/v1/teams?${searchParams.toString()}`);
  
  if (!res.ok) throw new Error('Network response was not ok');
  return res.json();
};

// --- Component ---

export default function TeamsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConference, setSelectedConference] = useState("all");

  const { data: conferences, isLoading: isLoadingConferences } = useQuery({
    queryKey: ['conferences'],
    queryFn: fetchConferences,
    staleTime: 24 * 60 * 60 * 1000,
  });
  
  const { data: teams, isLoading, isError } = useQuery({
    queryKey: ['teams', { search: searchQuery, conference: selectedConference }] as TeamsQueryKey,
    queryFn: fetchTeams,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Team Analytics</h2>
          <p className="text-gray-600">Explore comprehensive team profiles and strength ratings.</p>
        </div>

        <Card className="p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="search">Search Teams</Label>
              <Input
                id="search"
                placeholder="Search by team name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="conference">Filter by Conference</Label>
              <Select value={selectedConference} onValueChange={setSelectedConference} disabled={isLoadingConferences}>
                <SelectTrigger>
                  <SelectValue placeholder="All conferences" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All conferences</SelectItem>
                  {conferences?.map((conference) => (
                    <SelectItem key={conference} value={conference}>
                      {conference}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
          </div>
        ) : isError ? (
          <div className="text-center py-12 text-red-500">
            <h3>Failed to load teams. Please try again later.</h3>
          </div>
        ) : teams && teams.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => (
              // FIX: The TeamCard component now handles its own linking, so we just render it directly.
              <TeamCard
                key={team.id}
                team={team}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
             <h3 className="font-semibold text-lg">No teams found</h3>
             <p className="text-gray-600">Try adjusting your search or filter criteria.</p>
          </div>
        )}
      </main>
    </div>
  );
}