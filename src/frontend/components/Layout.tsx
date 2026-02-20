import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { cn } from '../utils';

export const Layout: React.FC = () => {
  const { pathname } = useLocation();

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-primary">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-foreground">Mantle AaaS</span>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink to="/" current={pathname === '/'}>
            Dashboard
          </NavLink>
          <NavLink to="/agents/new" current={pathname === '/agents/new'}>
            + New Agent
          </NavLink>
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

function NavLink({
  to,
  current,
  children,
}: {
  to: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm transition-colors',
        current
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
      )}
    >
      {children}
    </Link>
  );
}
