'use client';

import { Suspense } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ChapterCanvas from '@/components/ChapterCanvas';

export default function ChapterCanvasPage() {
  const params = useParams();
  const chapterId = params?.id as string;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 flex flex-col">
        <Header />
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-500">Loading chapter...</div>}>
          <ReactFlowProvider>
            <ChapterCanvas chapterId={chapterId} />
          </ReactFlowProvider>
        </Suspense>
      </main>
    </div>
  );
}
