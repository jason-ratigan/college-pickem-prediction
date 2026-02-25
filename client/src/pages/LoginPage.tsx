// client/src/pages/LoginPage.tsx

import { useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'react-hot-toast';
import { User } from '@/hooks/useAuth'; // Import the User type

const loginUser = async (credentials: {email: string, password: string}): Promise<User> => {
    const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
    });
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Login failed');
    }
    return res.json();
};

const LoginPage = () => {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => loginUser({ email, password }),
    // THE FINAL FIX IS HERE:
    onSuccess: (data) => {
      // `data` is the user object returned from our successful loginUser function.
      console.log('[DEBUG] LoginPage: Login successful. Received user data:', data);

      // Manually and synchronously update the 'user' query cache with the new data.
      // This is faster and more reliable than invalidating and waiting for a refetch.
      queryClient.setQueryData(['user'], data);

      console.log('[DEBUG] LoginPage: User query cache updated. Navigating to /...');
      navigate('/');
    },
    onError: (error) => {
      toast.error(`Login failed: ${error.message}`);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>Enter your credentials to access your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? 'Logging in...' : 'Login'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            Don't have an account?{' '}
            <a href="/register" className="underline" onClick={(e) => { e.preventDefault(); navigate('/register'); }}>
              Sign up
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;