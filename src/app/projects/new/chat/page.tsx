import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth-config';
import ChatPage from '@/components/chat/ChatPage';

export default async function ChatCreationPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=/projects/new/chat');
  }
  return <ChatPage />;
}
