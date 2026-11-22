'use client';

import { SessionProvider } from 'next-auth/react';
import { ProjectProvider } from '@/context/ProjectContext';
import KeyRequiredDialog from '@/components/KeyRequiredDialog';
import { I18nProvider } from '@/i18n/client';
import type { Locale } from '@/i18n/core';

export default function Providers({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  return (
    <I18nProvider locale={locale}>
    <SessionProvider>
      <ProjectProvider>
        {children}
        <KeyRequiredDialog />
      </ProjectProvider>
    </SessionProvider>
    </I18nProvider>
  );
}
