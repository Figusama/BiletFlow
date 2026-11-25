import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/Button';
import { colors, radius } from '../theme';
import { api } from '../api';
import { sessionInitials } from '../session';
import { EventItem } from '../types';

const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export default function EventsScreen({ navigation, onLogout, embedded }: any) {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setError('');
      const list = await api.getEvents();
      setEvents(list);
      setSelected((prev) => (prev && list.some((e) => e.id === prev) ? prev : list[0]?.id ?? null));
    } catch (e: any) {
      setError(e.message || 'Не удалось загрузить события');
    }
  };

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    load();
    return unsub;
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={embedded ? ['top'] : undefined}>
      <View style={styles.header}>
        <Text style={styles.logo}>BiletFlow <Text style={styles.logoSub}>Check-in</Text></Text>
        <Pressable onPress={onLogout} style={styles.avatar} accessibilityLabel="Sign out">
          <Text style={styles.avatarText}>{sessionInitials()}</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <ScrollView contentContainerStyle={{ gap: 14 }}>
          <Text style={styles.kicker}>YOUR ASSIGNED EVENTS</Text>

          {!events && !error && <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {events && events.length === 0 && (
            <Text style={styles.empty}>No assigned events yet. Accept the Event Admin invitation on the website.</Text>
          )}

          {events?.map((e) => {
            const pct = e.total ? Math.min(100, (e.checkedIn / e.total) * 100) : 0;
            const on = e.id === selected;
            return (
              <Pressable
                key={e.id}
                style={[styles.card, on && styles.cardOn]}
                onPress={() => setSelected(e.id)}
                accessibilityState={{ selected: on }}
              >
                <View style={styles.cardTop}>
                  <View style={styles.thumb}><Text style={styles.thumbText}>{e.title.slice(0, 1).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>{e.title}</Text>
                    <Text style={styles.sub} numberOfLines={2}>{e.subtitle}</Text>
                  </View>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.sub}>Checked in</Text>
                  <Text style={styles.count}>{fmt(e.checkedIn)} / {fmt(e.total)}</Text>
                </View>
                <View style={styles.bar}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
              </Pressable>
            );
          })}
        </ScrollView>

        <Button
          title="Start scanning"
          disabled={!selected}
          onPress={() => selected && navigation.navigate('Scanner', { eventId: selected })}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  logo: { color: colors.accentLight, fontSize: 20, fontWeight: '900' },
  logoSub: { color: colors.text, fontSize: 15, fontWeight: '700' },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EBE3FA', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.ink, fontWeight: '800', fontSize: 12 },
  body: { flex: 1, paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  kicker: { color: colors.text, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: 16, borderWidth: 1, borderColor: colors.cardBorder, gap: 12 },
  cardOn: { borderColor: '#5B43A0', backgroundColor: colors.cardSelected },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 56, height: 40, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  thumbText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 14, marginTop: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  count: { color: colors.text, fontSize: 15, fontWeight: '800' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.barBg, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.barFill },
  error: { color: '#FF9B94', fontSize: 16 },
  empty: { color: colors.muted, fontSize: 16 },
});
