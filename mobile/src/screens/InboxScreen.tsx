import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/Button';
import { colors, radius } from '../theme';
import {
  InvitationItem, NotificationItem, acceptInvitation, applyRead, applyReadAll, countUnread, declineInvitation,
  isSitePath, loadInvitations, loadNotifications, markAllRead, markRead,
} from '../api/inbox';

type Props = { navigation: any; onUnreadChange?: (n: number) => void };

// Вкладка Inbox: приглашения в команду мероприятия и уведомления.
export default function InboxScreen({ navigation, onUnreadChange }: Props) {
  const [notes, setNotes] = useState<NotificationItem[] | null>(null);
  const [invites, setInvites] = useState<InvitationItem[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const [n, i] = await Promise.all([loadNotifications(), loadInvitations().catch(() => [] as InvitationItem[])]);
      setNotes(n);
      setInvites(i);
      onUnreadChange?.(countUnread(n));
    } catch (e: any) {
      setError(e.message || 'Could not load');
    }
  }, [onUnreadChange]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const open = async (n: NotificationItem) => {
    if (!n.read && notes) {
      // считаем новый список вне setNotes, чтобы не менять состояние Home во время отрисовки
      const next = applyRead(notes, n.id);
      setNotes(next);
      onUnreadChange?.(countUnread(next));
      markRead(n.id).catch(() => {});
    }
    if (isSitePath(n.actionUrl)) navigation.navigate('Web', { title: n.title, path: n.actionUrl });
  };

  const readAll = async () => {
    if (notes) setNotes(applyReadAll(notes));
    onUnreadChange?.(0);
    try {
      await markAllRead();
    } catch (e: any) {
      Alert.alert('Could not update', e.message || 'Try again');
      load();
    }
  };

  const answer = async (inv: InvitationItem, accept: boolean) => {
    setBusyId(inv.id);
    try {
      await (accept ? acceptInvitation(inv.id) : declineInvitation(inv.id));
      setInvites((cur) => cur.filter((i) => i.id !== inv.id));
      if (accept) Alert.alert('Invitation accepted', `You can now work on “${inv.eventTitle}”. Open the Check-in tab.`);
    } catch (e: any) {
      Alert.alert('Action failed', e.message || 'Try again');
    } finally {
      setBusyId(null);
    }
  };

  const pending = invites.filter((i) => i.pending);
  const unread = notes ? countUnread(notes) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>Inbox</Text>
        {unread > 0 && (
          <Pressable onPress={readAll} hitSlop={10}>
            <Text style={styles.link}>Mark all read</Text>
          </Pressable>
        )}
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}
      >
        {!notes && !error && <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />}
        {!!error && <Text style={styles.error}>{error}</Text>}

        {pending.length > 0 && <Text style={styles.kicker}>INVITATIONS</Text>}
        {pending.map((inv) => (
          <View key={inv.id} style={styles.card}>
            <Text style={styles.title}>{inv.eventTitle}</Text>
            <Text style={styles.sub}>You are invited as {inv.roleLabel}</Text>
            {!!inv.expires && <Text style={styles.meta}>Expires: {inv.expires}</Text>}
            <View style={styles.actions}>
              <View style={{ flex: 1 }}>
                <Button title="Accept" onPress={() => answer(inv, true)} loading={busyId === inv.id} disabled={!!busyId} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Decline" variant="dark" onPress={() => answer(inv, false)} disabled={!!busyId} />
              </View>
            </View>
          </View>
        ))}

        {notes && notes.length > 0 && <Text style={[styles.kicker, pending.length > 0 && { marginTop: 8 }]}>NOTIFICATIONS</Text>}
        {notes?.map((n) => (
          <Pressable key={n.id} style={[styles.card, !n.read && styles.unread]} onPress={() => open(n)}>
            <View style={styles.row}>
              {!n.read && <View style={styles.dot} />}
              <Text style={styles.title}>{n.title}</Text>
            </View>
            {!!n.body && <Text style={styles.body}>{n.body}</Text>}
            <Text style={styles.meta}>{n.when}{isSitePath(n.actionUrl) ? '  ·  Tap to open' : ''}</Text>
          </Pressable>
        ))}

        {notes && notes.length === 0 && pending.length === 0 && (
          <Text style={styles.empty}>No notifications yet.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { color: colors.text, fontSize: 26, fontWeight: '900' },
  link: { color: colors.accentLight, fontSize: 14, fontWeight: '700' },
  kicker: { color: colors.text, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.cardBorder, padding: 16 },
  unread: { borderColor: colors.accent, backgroundColor: colors.cardSelected },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentLight },
  title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' },
  sub: { color: colors.accentLight, fontSize: 14, fontWeight: '700', marginTop: 4 },
  body: { color: colors.muted, fontSize: 14, marginTop: 6 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  error: { color: '#FFB4AE', textAlign: 'center' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 30, fontSize: 15 },
});
