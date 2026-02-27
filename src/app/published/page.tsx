import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import DraftsList from '@/components/DraftsList';

export default function PublishedPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60">
        <Header />
        <DraftsList filter="published" />
      </main>
    </div>
  );
}
