import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Badge from '../components/Badge';
import Button from '../components/Button';
import ScreenHeader from '../components/ScreenHeader';
import { colors, radius } from '../theme';
import { api } from '../api';
import { fmtDateTime, fmtPrice } from '../format';
import { CartLine, cartCount, cartTotal, clampQty, createReservation, maxQty, purchasable } from '../api/checkout';
import { PublicEvent, TicketTypeItem } from '../types';

export default function EventDetailsScreen({ route, navigation }: any) {
  const { eventRef } = route.params;
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [types, setTypes] = useState<TicketTypeItem[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const e = await api.getPublicEvent(eventRef);
        setEvent(e);
        try {
          setTypes(await api.getTicketTypes(e.id));
        } catch {}
      } catch (e: any) {
        setError(e.message || 'Could not load the event');
      }
    })();
  }, [eventRef]);

  const seated = event?.seatingMode === 'ASSIGNED_SEATING';
  const ended = event ? new Date(event.endsAt).getTime() < Date.now() : false;
  const canBuy = !!event && !seated && !ended && !event.isSuspended && event.status === 'PUBLISHED';

  const lines: CartLine[] = useMemo(
    () =>
      types
        .filter((t) => (qty[t.id] ?? 0) > 0)
        .map((t) => ({ ticketTypeId: t.id, name: t.name, unitPriceMinor: t.priceMinor, quantity: qty[t.id] })),
    [types, qty],
  );
  const count = cartCount(lines);
  const total = cartTotal(lines);

  const step = (t: TicketTypeItem, d: number) => setQty((cur) => ({ ...cur, [t.id]: clampQty((cur[t.id] ?? 0) + d, t) }));

  const checkout = async () => {
    if (!event || count === 0) return;
    setBusy(true);
    try {
      const reservation = await createReservation(event.id, lines);
      navigation.navigate('Checkout', {
        eventId: event.id,
        eventTitle: event.title,
        reservationId: reservation.id,
        expiresAt: reservation.expiresAt,
        lines,
      });
    } catch (e: any) {
      Alert.alert('Could not reserve tickets', e.message || 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const openWeb = () =>
    navigation.navigate('Web', { title: event?.title ?? 'Event', path: `/events/${event?.id}/tickets` });

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={event?.title ?? 'Event'} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        {!event && !error && <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />}
        {!!error && <Text style={styles.error}>{error}</Text>}

        {event && (
          <>
            <Text style={styles.date}>{fmtDateTime(event.startsAt, event.timezone).toUpperCase()}</Text>
            <Text style={styles.h1}>{event.title}</Text>
            <Text style={styles.sub}>{[event.venueName, event.address, event.city].filter(Boolean).join(' · ')}</Text>

            {!!event.description && <Text style={styles.desc}>{event.description}</Text>}

            <Text style={[styles.kicker, { marginTop: 8 }]}>TICKETS</Text>
            {types.length === 0 && <Text style={styles.sub}>Ticket types are not available yet.</Text>}
            {types.map((t) => {
              const can = canBuy && purchasable(t);
              const n = qty[t.id] ?? 0;
              return (
                <View key={t.id} style={styles.type}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeName}>{t.name}</Text>
                    <Text style={styles.sub}>{t.available != null ? `${t.available} left` : ''}</Text>
                    <Text style={styles.price}>{fmtPrice(t.priceMinor)}</Text>
                  </View>
                  {can ? (
                    <View style={styles.stepper}>
                      <Pressable style={[styles.stepBtn, n === 0 && { opacity: 0.4 }]} onPress={() => step(t, -1)} disabled={n === 0} accessibilityLabel={`Remove ${t.name}`}>
                        <Text style={styles.stepText}>−</Text>
                      </Pressable>
                      <Text style={styles.qty}>{n}</Text>
                      <Pressable style={[styles.stepBtn, n >= maxQty(t) && { opacity: 0.4 }]} onPress={() => step(t, 1)} disabled={n >= maxQty(t)} accessibilityLabel={`Add ${t.name}`}>
                        <Text style={styles.stepText}>+</Text>
                      </Pressable>
                    </View>
                  ) : (
                    !!t.saleState && <Badge label={t.saleState.replace(/_/g, ' ')} tone="neutral" />
                  )}
                </View>
              );
            })}

            <View style={{ height: 6 }} />
            {canBuy ? (
              <Button title={count ? `Continue · ${count} × · ${fmtPrice(total)}` : 'Select tickets'} onPress={checkout} disabled={count === 0} loading={busy} />
            ) : (
              <>
                {seated && <Text style={styles.sub}>This event has assigned seats. Choose your seats on the website.</Text>}
                {ended && <Text style={styles.sub}>This event has ended.</Text>}
                {event.isSuspended && <Text style={styles.sub}>Sales are paused by BiletFlow for this event.</Text>}
                {seated && <Button title="Choose seats on the website" onPress={openWeb} />}
              </>
            )}
            {canBuy && <Button title="Open on the website" variant="ghost" onPress={openWeb} />}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  date: { color: colors.accentLight, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  h1: { color: colors.text, fontSize: 28, fontWeight: '900' },
  sub: { color: colors.muted, fontSize: 14 },
  desc: { color: colors.text, fontSize: 16, lineHeight: 23 },
  kicker: { color: colors.text, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  type: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.field, padding: 16, borderWidth: 1, borderColor: colors.cardBorder },
  typeName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  price: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: -2 },
  qty: { color: colors.text, fontSize: 18, fontWeight: '800', minWidth: 20, textAlign: 'center' },
  error: { color: '#FF9B94', fontSize: 16 },
});
