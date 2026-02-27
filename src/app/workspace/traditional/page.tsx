import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import TraditionalEditor from '@/components/TraditionalEditor';

export default function TraditionalWorkspacePage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60">
        <Header />
        <TraditionalEditor />
      </main>
    </div>
  );
}
