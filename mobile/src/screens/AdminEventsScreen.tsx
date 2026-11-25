import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import Badge from '../components/Badge';
import Button from '../components/Button';
import PromptModal from '../components/PromptModal';
import { colors, radius } from '../theme';
import { fmtDateTime } from '../format';
import { AdminEventRow, restoreEvent, searchEvents, suspendEvent } from '../api/admin';

export default function AdminEventsScreen({ navigation }: any) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AdminEventRow[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<AdminEventRow | null>(null);

  const load = useCallback(async (text: string) => {
    try {
      setError('');
      setRows(await searchEvents(text));
    } catch (e: any) {
      setError(e.message || 'Could not load');
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 400);
    return () => clearTimeout(t);
  }, [q, load]);

  const patch = (id: string, p: Partial<AdminEventRow>) =>
    setRows((cur) => cur && cur.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const doSuspend = async (e: AdminEventRow, reason: string) => {
    setBusyId(e.id);
    try {
      await suspendEvent(e.id, reason);
      patch(e.id, { suspended: true, reason });
      setSuspending(null);
    } catch (err: any) {
      Alert.alert('Action failed', err.message || 'Try again');
    } finally {
      setBusyId(null);
    }
  };

  const doRestore = (e: AdminEventRow) =>
    Alert.alert(`Restore “${e.title}”?`, 'Sales and check-in will work again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: async () => {
          setBusyId(e.id);
          try {
            await restoreEvent(e.id);
            patch(e.id, { suspended: false, reason: undefined });
          } catch (err: any) {
            Alert.alert('Action failed', err.message || 'Try again');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Events" onBack={() => navigation.goBack()} />
      <View style={{ paddingHorizontal: 20 }}>
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder="Search by title"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
        {!rows && !error && <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {rows && rows.length === 0 && <Text style={styles.empty}>No events found.</Text>}
        {rows?.map((e) => (
          <View key={e.id} style={styles.card}>
            <View style={styles.top}>
              <Text style={styles.title} numberOfLines={2}>{e.title}</Text>
              <Badge label={e.suspended ? 'Suspended' : e.status} tone={e.suspended ? 'danger' : e.status === 'PUBLISHED' ? 'success' : 'neutral'} />
            </View>
            <Text style={styles.meta}>{fmtDateTime(e.startsAt)}</Text>
            {!!e.organizer && <Text style={styles.meta}>Organizer: {e.organizer}</Text>}
            <Text style={styles.meta}>Tickets issued: {e.tickets}</Text>
            {e.suspended && !!e.reason && <Text style={styles.reason}>Reason: {e.reason}</Text>}
            <View style={{ marginTop: 12 }}>
              {e.suspended ? (
                <Button title="Restore event" onPress={() => doRestore(e)} loading={busyId === e.id} disabled={!!busyId} />
              ) : (
                <Button title="Suspend event" variant="dark" onPress={() => setSuspending(e)} disabled={!!busyId} />
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      <PromptModal
        visible={!!suspending}
        title={suspending ? `Suspend “${suspending.title}”` : ''}
        hint="Sales and check-in stop. The organizer will see this reason."
        confirmLabel="Suspend"
        busy={!!busyId}
        onCancel={() => setSuspending(null)}
        onSubmit={(text) => suspending && doSuspend(suspending, text)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  search: { backgroundColor: colors.card, borderRadius: radius.field, borderWidth: 1, borderColor: colors.cardBorder, color: colors.text, paddingHorizontal: 14, height: 48, fontSize: 16 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.cardBorder, padding: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 14, marginTop: 2 },
  reason: { color: '#FFB4AE', fontSize: 14, marginTop: 6 },
  error: { color: '#FFB4AE', textAlign: 'center' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 30 },
});
