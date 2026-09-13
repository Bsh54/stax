'use client';

import { useEffect, useState } from 'react';
import { Keypair } from '@solana/web3.js';

/**
 * A throwaway demo keypair, persisted in localStorage.
 *
 * The public demo runs on a mainnet fork. A real wallet (Phantom) points at mainnet and simulates
 * fork transactions against it, which reverts ("unknown error"). A browser-local keypair sidesteps
 * that entirely: it signs fork transactions directly and submits them through our /api/rpc proxy, so
 * anyone can click through deposit and withdraw with no wallet setup and no network mismatch.
 */
const KEY = 'stax.demo.sk';

export function useDemoWallet(): Keypair | null {
  const [kp, setKp] = useState<Keypair | null>(null);

  useEffect(() => {
    let k: Keypair | null = null;
    const stored = localStorage.getItem(KEY);
    if (stored) {
      try {
        k = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored) as number[]));
      } catch {
        k = null;
      }
    }
    if (!k) {
      k = Keypair.generate();
      localStorage.setItem(KEY, JSON.stringify(Array.from(k.secretKey)));
    }
    setKp(k);
  }, []);

  return kp;
}
