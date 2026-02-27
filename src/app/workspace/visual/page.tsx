import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import VisualCanvas from '@/components/VisualCanvas';

export default function VisualWorkspacePage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 flex flex-col">
        <Header />
        <VisualCanvas />
      </main>
    </div>
  );
}
