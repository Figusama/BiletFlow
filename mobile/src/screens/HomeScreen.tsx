import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TabBar, { TabKey } from '../components/TabBar';
import DiscoverScreen from './DiscoverScreen';
import TicketsScreen from './TicketsScreen';
import InboxScreen from './InboxScreen';
import EventsScreen from './EventsScreen';
import AdminScreen from './AdminScreen';
import MoreScreen from './MoreScreen';
import { getMyRole } from '../api/admin';
import { unreadCount } from '../api/inbox';
import { colors } from '../theme';

export default function HomeScreen({ navigation, route, onLogout }: any) {
  const [tab, setTab] = useState<TabKey>('discover');
  const [isAdmin, setIsAdmin] = useState(false);
  const [unread, setUnread] = useState(0);
  // После покупки экран Checkout возвращает сюда с параметром tab: 'tickets'
  const wantedTab = route?.params?.tab as TabKey | undefined;
  const wantedAt = route?.params?.at;
  useEffect(() => {
    if (wantedTab) setTab(wantedTab);
  }, [wantedTab, wantedAt]);
  const insets = useSafeAreaInsets();

  // Роль приходит с сервера. Если запрос не удался, вкладка Admin просто не показывается.
  useEffect(() => {
    let alive = true;
    getMyRole()
      .then((r) => alive && setIsAdmin(r === 'PLATFORM_ADMIN'))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Число непрочитанных для значка на вкладке Inbox: при открытии и при каждой смене вкладки.
  useEffect(() => {
    let alive = true;
    unreadCount()
      .then((n) => alive && setUnread(n))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tab]);

  const onUnreadChange = useCallback((n: number) => setUnread(n), []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1 }}>
        {tab === 'discover' && <DiscoverScreen navigation={navigation} />}
        {tab === 'tickets' && <TicketsScreen navigation={navigation} />}
        {tab === 'inbox' && <InboxScreen navigation={navigation} onUnreadChange={onUnreadChange} />}
        {tab === 'events' && <EventsScreen navigation={navigation} onLogout={onLogout} embedded />}
        {tab === 'admin' && isAdmin && <AdminScreen navigation={navigation} />}
        {tab === 'more' && <MoreScreen navigation={navigation} onLogout={onLogout} />}
      </View>
      <TabBar active={tab} onChange={setTab} bottomInset={insets.bottom} isAdmin={isAdmin} badges={{ inbox: unread }} />
    </View>
  );
}
