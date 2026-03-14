'use client';

import { SessionProvider } from 'next-auth/react';
import { ProjectProvider } from '@/context/ProjectContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ProjectProvider>{children}</ProjectProvider>
    </SessionProvider>
  );
}
