import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { ChatList } from '@/components/chat-list';
import { useSnapshot } from '@/lib/store';
import { isArchived, sortChats } from '@/lib/types';

const FOLDERS = {
  'low-priority': {
    title: 'Low priority',
    empty: 'Nothing here. Move noisy chats here to keep your inbox calm.',
  },
  archive: {
    title: 'Archived',
    empty: 'No archived chats. Swipe a chat left to archive it — it comes back when someone replies.',
  },
} as const;

export default function Folder() {
  const { name } = useLocalSearchParams<{ name: keyof typeof FOLDERS }>();
  const folder = FOLDERS[name] ?? FOLDERS.archive;
  const { chats } = useSnapshot();

  const visible = useMemo(() => {
    const real = chats.filter((c) => !c.isBridgeControl && !c.incomplete);
    const matching =
      name === 'low-priority' ? real.filter((c) => c.lowPriority && !isArchived(c)) : real.filter(isArchived);
    return sortChats(matching);
  }, [chats, name]);

  return (
    <>
      <Stack.Screen options={{ title: folder.title }} />
      <ChatList chats={visible} emptyText={folder.empty} />
    </>
  );
}
