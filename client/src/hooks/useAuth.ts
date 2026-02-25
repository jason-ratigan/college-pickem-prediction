// client/src/hooks/useAuth.ts

import { useQuery } from "@tanstack/react-query";

// Define the User type to match our backend session data
export interface User {
  id: string;
  email: string;
  fullName: string | null;
  role: string; // The role is important for admin checks
}

// The function that tells React Query how to fetch the user status
const fetchUser = async (): Promise<User | null> => {
    const res = await fetch('/api/v1/auth/user');
    
    // A 401 or other error might occur if the session is invalid.
    // We treat this as "not logged in" rather than a critical error.
    if (!res.ok) {
        return null;
    }

    const user = await res.json();
    // The endpoint returns null for a logged-out user.
    return user || null;
};

// The corrected useAuth hook
export function useAuth() {
  const { data: user, isLoading, isError } = useQuery({
    // FIX: The queryKey is now simple and matches the key used in LoginPage.tsx
    queryKey: ['user'],
    
    // This function will be called by React Query to get the data
    queryFn: fetchUser,
    
    // These settings are perfect for an auth hook
    refetchOnWindowFocus: false,
    staleTime: Infinity, 
    retry: false,
  });

  return {
    user: user || null,
    isLoading,
    // The logic here is solid: you are authenticated if you have a user object.
    isAuthenticated: !!user,
    isError,
  };
}