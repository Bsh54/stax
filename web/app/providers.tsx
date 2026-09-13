'use client';

import { ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@solana/wallet-adapter-react-ui/styles.css';

/**
 * App-wide providers: Solana RPC connection, wallet adapter, and React Query.
 * The RPC endpoint is configurable via NEXT_PUBLIC_RPC_URL (defaults to a local
 * Surfpool mainnet fork during development).
 */
export function Providers({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL || 'http://127.0.0.1:8899';
  const wallets = useMemo(() => [], []);
  const queryClient = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { refetchInterval: 10_000 } } }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
