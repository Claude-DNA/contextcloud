'use client';

import { SessionProvider } from 'next-auth/react';
import { ProjectProvider } from '@/context/ProjectContext';
import KeyRequiredDialog from '@/components/KeyRequiredDialog';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ProjectProvider>
        {children}
        <KeyRequiredDialog />
      </ProjectProvider>
    </SessionProvider>
  );
}
