import React from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Navigate, Outlet } from 'react-router-dom';

export const AuthGuard: React.FC = () => {
  const { ready, authenticated } = usePrivy();

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};
