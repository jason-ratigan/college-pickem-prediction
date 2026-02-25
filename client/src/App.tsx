// client/src/App.tsx

import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { useAuth } from "./hooks/useAuth";

// Import ONLY the pages that are still in use
import NotFound from "./pages/not-found";
import TeamsPage from "./pages/TeamsPage";
import TeamProfile from "./pages/TeamProfile";
import GamesPage from "./pages/GamesPage"; // Our new central hub!
import GameAnalysisPage from "./pages/GameAnalysisPage";
import TeamRankingsPage from "./pages/TeamRankingsPage";
import MyPicksHistoryPage from "./pages/MyPicksHistoryPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AdminPage from "./pages/AdminPage";
import AdminStatisticsPage from "./pages/AdminStatisticsPage";

// This component now contains a cleaner, more focused set of routes.
const ProtectedRoutes = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    // A simple loading state while checking the user's session
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  // If authenticated, render the protected routes.
  return (
    <Switch>
      {/* Redirect the root path to our new Games Hub */}
      <Route path="/">
        <Redirect to="/games" />
      </Route>
      
      {/* Retained and enhanced routes */}
      <Route path="/games" component={GamesPage} />
      <Route path="/games/:gameId/analysis" component={GameAnalysisPage} />
      <Route path="/teams" component={TeamsPage} />
      {/* CORRECTED: The route param is now ':id' to match the component */}
      <Route path="/teams/:id" component={TeamProfile} />
      <Route path="/rankings" component={TeamRankingsPage} />
      <Route path="/my-picks" component={MyPicksHistoryPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/statistics/:season" component={AdminStatisticsPage} />

      {/* Fallback for any other authenticated route */}
      <Route component={NotFound} />
    </Switch>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* The Toaster component is needed for react-hot-toast, which we added to GamesPage */}
        {/* If you are using shadcn's toaster, this is correct. If using react-hot-toast, import { Toaster } from 'react-hot-toast' */}
        <Toaster /> 
        <Switch>
          {/* Public routes */}
          <Route path="/login" component={LoginPage} />
          <Route path="/register" component={RegisterPage} />

          {/* All other routes are handled by our ProtectedRoutes component */}
          <Route>
            <ProtectedRoutes />
          </Route>
        </Switch>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;