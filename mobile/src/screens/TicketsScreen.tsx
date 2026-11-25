import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Badge, { BadgeTone } from '../components/Badge';
import { colors, radius, fonts } from '../theme';
import { api } from '../api';
import { fmtDateTime } from '../format';
import { MyTicket } from '../types';

export const STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  VALID: { label: 'Valid', tone: 'success' },
  CHECKED_IN: { label: 'Checked in', tone: 'info' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  REFUNDED: { label: 'Refunded', tone: 'danger' },
};

export default function TicketsScreen({ navigation }: any) {
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const list = await api.getMyTickets();
      setTickets([...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    } catch (e: any) {
      setError(e.message || 'Could not load tickets');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>My tickets</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}
      >
        {!tickets && !error && <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {tickets && tickets.length === 0 && (
          <Text style={styles.empty}>You have no tickets yet. Find an event in Discover.</Text>
        )}

        {tickets?.map((t) => {
          const b = STATUS_BADGE[t.status] ?? STATUS_BADGE.VALID;
          return (
            <Pressable key={t.id} style={styles.card} onPress={() => navigation.navigate('TicketDetail', { ticket: t })}>
              <View style={styles.row}>
                <Text style={styles.date}>{fmtDateTime(t.startsAt, t.timezone).toUpperCase()}</Text>
                <Badge label={b.label} tone={b.tone} />
              </View>
              <Text style={styles.title}>{t.eventTitle}</Text>
              <Text style={styles.sub}>{[t.venueName, t.ticketTypeName, t.seatLabel].filter(Boolean).join(' · ')}</Text>
              <Text style={styles.id}>{t.publicId}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 8 },
  logo: { color: colors.text, fontSize: 26, fontWeight: '900' },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: 18, borderWidth: 1, borderColor: colors.cardBorder, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { color: colors.accentLight, fontSize: 12, fontWeight: '800', letterSpacing: 1, flex: 1 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 6 },
  sub: { color: colors.muted, fontSize: 14 },
  id: { color: colors.muted, fontSize: 13, fontFamily: fonts.mono, marginTop: 6 },
  error: { color: '#FF9B94', fontSize: 16 },
  empty: { color: colors.muted, fontSize: 16 },
});
