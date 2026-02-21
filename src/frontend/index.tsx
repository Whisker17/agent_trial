import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { mantle, mantleSepoliaTestnet } from 'viem/chains';
import { setAuthTokenGetter } from './api';
import { Layout } from './components/Layout';
import { AuthGuard } from './components/AuthGuard';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { AgentWizard } from './pages/AgentWizard';
import { AgentDetail } from './pages/AgentDetail';
import { AgentChat } from './pages/AgentChat';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

function AuthTokenSync({ children }: { children: React.ReactNode }) {
  const { getAccessToken } = usePrivy();

  useEffect(() => {
    setAuthTokenGetter(getAccessToken);
  }, [getAccessToken]);

  return <>{children}</>;
}

function App() {
  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        supportedChains: [mantleSepoliaTestnet, mantle],
        defaultChain: mantleSepoliaTestnet,
        appearance: { theme: 'dark' },
      }}
    >
      <AuthTokenSync>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route element={<AuthGuard />}>
                <Route element={<Layout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/agents/new" element={<AgentWizard />} />
                  <Route path="/agents/:id" element={<AgentDetail />} />
                  <Route path="/agents/:id/chat" element={<AgentChat />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </AuthTokenSync>
    </PrivyProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
