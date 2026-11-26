import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Badge from '../components/Badge';
import Button from '../components/Button';
import ScreenHeader from '../components/ScreenHeader';
import { colors, radius } from '../theme';
import { fmtDateTime, fmtNumber, fmtPrice } from '../format';
import { WEB_ROUTES } from '../config';
import {
  ManagedEvent, ManagedTicketType, PaidSalesState, SalesSummary, canPublish, canUnpublish, getManagedEvent,
  getManagedTicketTypes, getPaidSales, getSalesSummary, paidSalesText, publishEvent, soldText, statusInfo, unpublishEvent,
} from '../api/myEvents';

// Экран события для организатора: статус, продажи, типы билетов, публикация, сканер.
export default function MyEventScreen({ route, navigation }: any) {
  const { eventId } = route.params as { eventId: string };
  const [event, setEvent] = useState<ManagedEvent | null>(null);
  const [types, setTypes] = useState<ManagedTicketType[] | null>(null);
  const [sales, setSales] = useState<SalesSummary | null>(null);
  const [paid, setPaid] = useState<PaidSalesState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setEvent(await getManagedEvent(eventId));
    } catch (e: any) {
      setError(e.message || 'Could not load the event');
      return;
    }
    // остальное необязательно: у сотрудника нет прав на аналитику и платные продажи
    getManagedTicketTypes(eventId).then(setTypes).catch(() => setTypes([]));
    getSalesSummary(eventId).then(setSales);
    getPaidSales(eventId).then(setPaid);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const change = (action: 'publish' | 'unpublish') => {
    if (!event) return;
    const publishing = action === 'publish';
    Alert.alert(
      publishing ? 'Publish this event?' : 'Unpublish this event?',
      publishing
        ? 'It becomes visible to everyone and tickets can be bought.'
        : 'It disappears from public lists. Existing tickets stay valid.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: publishing ? 'Publish' : 'Unpublish',
          onPress: async () => {
            setBusy(true);
            try {
              setEvent(await (publishing ? publishEvent : unpublishEvent)(event.id));
            } catch (e: any) {
              Alert.alert(publishing ? 'Could not publish' : 'Could not unpublish', e.message || 'Try again');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const st = event ? statusInfo(event.status, event.isSuspended) : null;
  const web = WEB_ROUTES.find((r) => r.key === 'org-events');
  const hasPaid = !!types?.some((t) => t.priceMinor > 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Event" onBack={() => navigation.goBack()} />
      {!event && !error && <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {event && st && (
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}
        >
          <Text style={styles.h1}>{event.title}</Text>
          <View style={styles.rowWrap}>
            <Badge label={st.label} tone={st.tone} />
          </View>
          <Text style={styles.sub}>{fmtDateTime(event.startsAt, event.timezone || undefined)}</Text>
          {!!event.venue && <Text style={styles.sub}>{event.venue}</Text>}

          {sales && (
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNum}>
                  {fmtNumber(sales.sold)}{sales.capacity != null ? ` / ${fmtNumber(sales.capacity)}` : ''}
                </Text>
                <Text style={styles.statLabel}>Tickets sold</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{fmtPrice(sales.grossMinor) === 'Free' ? '0 ₸' : fmtPrice(sales.grossMinor)}</Text>
                <Text style={styles.statLabel}>{sales.demo ? 'Gross sales (demo)' : 'Gross sales'}</Text>
              </View>
            </View>
          )}

          {hasPaid && !!paid && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{paidSalesText(paid)}</Text>
              {!paid.activated && (
                <Text style={styles.sub}>
                  Paid tickets cannot be bought until a platform admin activates paid sales for this event.
                </Text>
              )}
            </View>
          )}

          <Text style={styles.kicker}>TICKET TYPES</Text>
          {!types && <ActivityIndicator color="#fff" />}
          {types && types.length === 0 && (
            <Text style={styles.sub}>No ticket types yet. Add them on the website before publishing.</Text>
          )}
          {types?.map((t) => (
            <View key={t.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle} numberOfLines={1}>{t.name}</Text>
                <Text style={styles.cardTitle}>{fmtPrice(t.priceMinor)}</Text>
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.sub}>{soldText(t)}</Text>
                <Text style={styles.sub}>{t.active ? t.saleState.replace(/_/g, ' ').toLowerCase() : 'inactive'}</Text>
              </View>
            </View>
          ))}

          <View style={{ height: 4 }} />
          <Button title="Start scanning" onPress={() => navigation.navigate('Scanner', { eventId: event.id })} />
          <Button title="Guest search" variant="dark" onPress={() => navigation.navigate('Search', { eventId: event.id })} />
          {canPublish(event) && <Button title="Publish event" onPress={() => change('publish')} loading={busy} />}
          {canUnpublish(event) && <Button title="Unpublish event" variant="dark" onPress={() => change('unpublish')} loading={busy} />}
          {web && (
            <Button
              title="Edit on the website"
              variant="ghost"
              onPress={() => navigation.navigate('Web', { title: web.title, path: web.path })}
            />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 26, fontWeight: '900' },
  rowWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sub: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  kicker: { color: colors.text, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginTop: 6 },
  statsRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, gap: 4 },
  statNum: { color: colors.text, fontSize: 20, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: radius.field, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 6 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  error: { color: '#FF9B94', fontSize: 16, padding: 20 },
});
