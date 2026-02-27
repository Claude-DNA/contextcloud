import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import DashboardContent from '@/components/DashboardContent';

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60">
        <Header />
        <DashboardContent />
      </main>
    </div>
  );
}
