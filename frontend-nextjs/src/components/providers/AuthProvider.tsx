'use client';

import React from 'react';
import { SessionProvider } from 'next-auth/react';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider 
      refetchOnWindowFocus={false} 
      refetchInterval={0}
    >
      {children}
    </SessionProvider>
  );
}

export default AuthProvider;