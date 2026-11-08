import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth-config';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export const metadata: Metadata = { title: 'Start a new flow · Context Cloud' };

const WAYS = [
  {
    title: 'Upload a text',
    body: 'Drop in a story, essay or chapter. Context Cloud builds its clouds, then Make a flow drafts all five layers from them.',
    href: '/workspace/visual?upload=1',
    ai: true,
  },
  {
    title: 'Quick Capture',
    body: 'Paste a few lines or rough notes and file them into the right cloud as you go.',
    href: '/workspace/add-to-cloud',
    ai: true,
  },
  {
    title: 'Build with chat',
    body: 'Talk the work through. Chat Creator turns the conversation into clouds you can edit.',
    href: '/projects/new/chat',
    ai: true,
  },
  {
    title: 'Write it yourself',
    body: 'Open the flow editor and fill in the five layers yourself, or have the AI draft them from one of your projects.',
    href: '/workspace/traditional?type=flow',
    ai: false,
  },
];

type Props = { searchParams: Promise<{ from?: string }> };

/** Landing page for "Create a new flow" links from ConteXtube. Signed-out visitors sign in first and come back here. */
export default async function NewFlowPage({ searchParams }: Props) {
  const { from } = await searchParams;
  const session = await auth();
  if (!session?.user) {
    const back = from ? `/new?from=${encodeURIComponent(from)}` : '/new';
    redirect(`/auth/signup?callbackUrl=${encodeURIComponent(back)}`);
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60">
        <Header />
        <div className="max-w-3xl mx-auto px-8 py-12">
          <h1 className="text-2xl font-semibold">Start a new flow</h1>
          <p className="mt-2 text-muted max-w-xl">
            A flow is your reading of a work: its ideas, connections and meaning, in layers. Pick how you want to begin.
            When you publish, it appears on{' '}
            <a href="https://contextube.ai" className="text-accent hover:underline">ConteXtube</a> under your name.
          </p>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {WAYS.map((w) => (
              <li key={w.href}>
                <Link
                  href={w.href}
                  className="group flex h-full flex-col rounded-xl border border-border bg-white p-5 hover:border-accent transition-colors"
                >
                  <span className="font-semibold group-hover:text-accent transition-colors">{w.title}</span>
                  <span className="mt-1.5 text-sm text-muted leading-relaxed flex-1">{w.body}</span>
                  {w.ai && <span className="mt-3 text-xs text-muted">Uses AI</span>}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-sm text-muted">
            The AI options use your own API key from Google, Anthropic, OpenAI or OpenRouter, and the model you choose.
            Add it in <Link href="/workspace/settings" className="text-accent hover:underline">Settings</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
