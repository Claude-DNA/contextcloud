'use client';

import { Suspense } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import VisualCanvas from '@/components/VisualCanvas';

export default function VisualWorkspacePage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 flex flex-col">
        <Header />
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-500">Loading graph editor...</div>}>
          <ReactFlowProvider>
            <VisualCanvas />
          </ReactFlowProvider>
        </Suspense>
      </main>
    </div>
  );
}
