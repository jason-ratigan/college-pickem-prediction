// client/src/components/Navigation.tsx

import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth"; // The User type is now exported from useAuth
import { useMutation, useQueryClient } from "@tanstack/react-query";

const logoutUser = async () => {
    const res = await fetch('/api/v1/auth/logout', { method: 'POST' });
    if (!res.ok) throw new Error("Logout failed");
    return res.json();
}

export default function Navigation() {
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();

  // FIX: Simplified call to the new useAuth hook.
  const { user, isAuthenticated } = useAuth();

  const logoutMutation = useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      // FIX: Use the correct, unified queryKey to clear user data.
      queryClient.invalidateQueries({ queryKey: ['user'] });
      navigate("/login");
    },
    onError: (error) => {
      alert(`Logout failed: ${error.message}`);
    }
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // FIX: Simplified navigation items to reflect the new application structure.
  const navItems = [
    { href: "/games", label: "Games Hub" },
    { href: "/teams", label: "Teams" },
    { href: "/rankings", label: "Rankings" },
    { href: "/my-picks", label: "My History" },
  ];

  // Conditionally add the Admin link if the user has the admin role.
  if (user?.role === 'admin') {
    navItems.push({ href: "/admin", label: "Admin" });
  }

  return (
    <nav className="bg-white shadow-sm sticky top-0 z-50 border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link href="/" className="font-bold text-xl text-gray-800">College Pick'em</Link>
            {isAuthenticated && (
              <div className="hidden md:flex items-baseline space-x-4">
                {navItems.map((item) => {
                  // FIX: Improved active link logic for better accuracy.
                  const isActive = location === item.href || (item.href !== "/games" && location.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? "text-gray-900 font-semibold bg-gray-100"
                          : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-gray-600 hidden sm:block">
                  Welcome, {user?.fullName || user?.email}
                </span>
                <Button onClick={handleLogout} variant="outline" size="sm" disabled={logoutMutation.isPending}>
                  {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => navigate("/login")} variant="ghost" size="sm">
                  Login
                </Button>
                <Button onClick={() => navigate("/register")} size="sm">
                  Register
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}