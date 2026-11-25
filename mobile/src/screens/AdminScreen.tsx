import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { QUEUES, QueueKind, loadCounts } from '../api/admin';

// Главная вкладка Platform Admin: очереди с числом заявок и разделы Users / Events.
export default function AdminScreen({ navigation }: any) {
  const [counts, setCounts] = useState<Record<QueueKind, number | null> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setCounts(await loadCounts());
  }, []);

  useEffect(() => {
    load();
    // при возврате с экрана очереди числа обновляются
    const unsub = navigation.addListener?.('focus', load);
    return unsub;
  }, [load, navigation]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>Platform admin</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}
      >
        <Text style={styles.kicker}>REVIEW QUEUES</Text>
        {QUEUES.map((q) => {
          const n = counts?.[q.kind];
          return (
            <Pressable key={q.kind} style={styles.row} onPress={() => navigation.navigate('AdminQueue', { kind: q.kind })}>
              <Text style={styles.icon}>{q.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{q.title}</Text>
                <Text style={styles.rowHint}>{q.hint}</Text>
              </View>
              {typeof n === 'number' && (
                <View style={[styles.count, n === 0 && styles.countZero]}>
                  <Text style={styles.countText}>{n}</Text>
                </View>
              )}
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          );
        })}

        <Text style={[styles.kicker, { marginTop: 10 }]}>MANAGE</Text>
        <Pressable style={styles.row} onPress={() => navigation.navigate('AdminUsers')}>
          <Text style={styles.icon}>👥</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Users</Text>
            <Text style={styles.rowHint}>Search, suspend or restore accounts</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('AdminEvents')}>
          <Text style={styles.icon}>📅</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Events</Text>
            <Text style={styles.rowHint}>Suspend or restore events</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 8 },
  logo: { color: colors.text, fontSize: 26, fontWeight: '900' },
  kicker: { color: colors.text, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, backgroundColor: colors.card, borderRadius: radius.field, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  icon: { fontSize: 22 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rowHint: { color: colors.muted, fontSize: 13, marginTop: 2 },
  count: { minWidth: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  countZero: { backgroundColor: colors.secondary },
  countText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  arrow: { color: colors.muted, fontSize: 24 },
});
