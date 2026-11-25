import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import PromptModal from '../components/PromptModal';
import { colors, radius } from '../theme';
import { QUEUES, QueueItem, QueueKind, approve, loadQueue, reject, retryRefund } from '../api/admin';

export default function AdminQueueScreen({ navigation, route }: any) {
  const kind: QueueKind = route.params.kind;
  const meta = QUEUES.find((q) => q.kind === kind)!;
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<QueueItem | null>(null);

  const load = useCallback(async () => {
    try {
      setError('');
      setItems(await loadQueue(kind));
    } catch (e: any) {
      setError(e.message || 'Could not load');
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const run = async (item: QueueItem, action: () => Promise<any>) => {
    setBusyId(item.id);
    try {
      await action();
      setItems((cur) => (cur ? cur.filter((i) => i.id !== item.id) : cur));
    } catch (e: any) {
      Alert.alert('Action failed', e.message || 'Try again');
    } finally {
      setBusyId(null);
      setRejecting(null);
    }
  };

  const onApprove = (item: QueueItem) => {
    if (item.kind === 'cancellations') {
      Alert.alert('Approve cancellation', 'How should ticket refunds be handled?', [
        { text: 'Refund all automatically', onPress: () => run(item, () => approve(item, { refundMode: 'AUTOMATIC_FULL' })) },
        { text: 'Review refunds myself', onPress: () => run(item, () => approve(item, { refundMode: 'ADMIN_REVIEW' })) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    const text =
      item.kind === 'applications'
        ? 'You confirm that the responsible organizer is correct and the event can be published.'
        : 'This action cannot be undone.';
    Alert.alert(`Approve “${item.title}”?`, text, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => run(item, () => approve(item)) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={meta.title} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}
      >
        {!items && !error && <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {items && items.length === 0 && <Text style={styles.empty}>Nothing is waiting here. 🎉</Text>}

        {items?.map((it) => (
          <View key={it.id} style={styles.card}>
            <Text style={styles.title}>{it.title}</Text>
            {!!it.subtitle && <Text style={styles.sub}>{it.subtitle}</Text>}
            <View style={{ marginTop: 8, gap: 4 }}>
              {it.lines.map((l, i) => (
                <Text key={i} style={styles.line}>{l}</Text>
              ))}
            </View>
            {it.decidable && (
              <View style={styles.actions}>
                <View style={{ flex: 1 }}>
                  <Button title="Approve" onPress={() => onApprove(it)} loading={busyId === it.id} disabled={!!busyId} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Reject" variant="dark" onPress={() => setRejecting(it)} disabled={!!busyId} />
                </View>
              </View>
            )}
            {it.canRetry && (
              <View style={{ marginTop: 10 }}>
                <Button title="Retry payout" variant="ghost" onPress={() => run(it, () => retryRefund(it.id))} loading={busyId === it.id} disabled={!!busyId} />
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <PromptModal
        visible={!!rejecting}
        title={rejecting ? `Reject “${rejecting.title}”` : ''}
        hint="The organizer or customer will see this reason."
        confirmLabel="Reject"
        busy={!!busyId}
        onCancel={() => setRejecting(null)}
        onSubmit={(text) => rejecting && run(rejecting, () => reject(rejecting, text))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.cardBorder, padding: 18 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  sub: { color: colors.accentLight, fontSize: 13, fontWeight: '700', marginTop: 2 },
  line: { color: colors.muted, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  error: { color: '#FFB4AE', textAlign: 'center' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 30, fontSize: 15 },
});
