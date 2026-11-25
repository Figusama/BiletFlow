import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Badge from '../components/Badge';
import { colors, radius } from '../theme';
import { api } from '../api';
import { fmtDateTime } from '../format';
import { PublicEvent } from '../types';

export default function DiscoverScreen({ navigation }: any) {
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setEvents(await api.getPublicEvents());
    } catch (e: any) {
      setError(e.message || 'Could not load events');
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
        <Text style={styles.logo}>BiletFlow</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}
      >
        <Text style={styles.kicker}>DISCOVER EVENTS</Text>
        {!events && !error && <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {events && events.length === 0 && <Text style={styles.empty}>No events yet.</Text>}

        {events?.map((e) => (
          <Pressable
            key={e.id}
            style={styles.card}
            onPress={() => navigation.navigate('EventDetails', { eventRef: e.id })}
          >
            <Text style={styles.date}>{fmtDateTime(e.startsAt, e.timezone).toUpperCase()}</Text>
            <Text style={styles.title}>{e.title}</Text>
            <Text style={styles.sub}>{[e.venueName, e.city].filter(Boolean).join(' · ')}</Text>
            {(e.isSuspended || e.status !== 'PUBLISHED') && (
              <View style={{ alignSelf: 'flex-start', marginTop: 10 }}>
                <Badge label={e.isSuspended ? 'Suspended' : e.status} tone={e.isSuspended ? 'danger' : 'neutral'} />
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 8 },
  logo: { color: colors.accentLight, fontSize: 20, fontWeight: '900' },
  kicker: { color: colors.text, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: 18, borderWidth: 1, borderColor: colors.cardBorder },
  date: { color: colors.accentLight, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 6 },
  sub: { color: colors.muted, fontSize: 14, marginTop: 4 },
  error: { color: '#FF9B94', fontSize: 16 },
  empty: { color: colors.muted, fontSize: 16 },
});
