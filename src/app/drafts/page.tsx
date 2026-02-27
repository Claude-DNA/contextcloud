import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import DraftsList from '@/components/DraftsList';

export default function DraftsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60">
        <Header />
        <DraftsList filter="draft" />
      </main>
    </div>
  );
}
