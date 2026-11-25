import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Modal, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Badge from '../components/Badge';
import Button from '../components/Button';
import ScreenHeader from '../components/ScreenHeader';
import UndoCheckIn from '../components/UndoCheckIn';
import { colors } from '../theme';
import { api } from '../api';
import { bumpDevice } from '../session';
import { Attendee, ScanResult } from '../types';

export default function SearchScreen({ route, navigation }: any) {
  const { eventId } = route.params;
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Attendee[] | null>(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [undoFor, setUndoFor] = useState<Attendee | null>(null);

  const load = useCallback(
    async (text: string) => {
      try {
        setError('');
        setRows(await api.search(eventId, text));
      } catch (e: any) {
        setError(e.message || 'Search failed');
      }
    },
    [eventId]
  );

  useEffect(() => {
    api.getEvent(eventId)
      .then((e) => setTitle(`${e.title}${e.gate ? ' · ' + e.gate : ''}`))
      .catch(() => {});
  }, [eventId]);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  const confirmUndo = async (reason: string) => {
    if (!undoFor) return;
    try {
      await api.undo(eventId, undoFor.ticketId, reason);
      bumpDevice(eventId, -1);
      setUndoFor(null);
      load(q);
    } catch (e: any) {
      Alert.alert('Could not undo', e.message || 'Try again');
    }
  };

  const asResult = (a: Attendee): ScanResult => ({
    status: 'valid',
    message: 'Checked in',
    attendee: a.name,
    seat: a.seat,
    ticketId: a.ticketId,
    publicId: a.publicId,
  });

  const right = (a: Attendee) => {
    if (a.status === 'checked_in')
      return (
        <Pressable onPress={() => setUndoFor(a)} accessibilityLabel="Undo check-in" hitSlop={8}>
          <Badge label="Checked in" tone="info" />
        </Pressable>
      );
    if (a.status === 'valid') return <Badge label="Valid" tone="success" />;
    if (a.status === 'refunded') return <Badge label="Refunded" tone="danger" />;
    return <Badge label="Cancelled" tone="danger" />;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />

      <View style={styles.body}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
          <TextInput
            style={styles.input}
            value={q}
            onChangeText={setQ}
            placeholder="Find by name or ticket ID"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {!!error && <Text style={styles.error}>{error}</Text>}
          {rows && !error && (
            <Text style={styles.kicker}>{rows.length} {rows.length === 1 ? 'RESULT' : 'RESULTS'}</Text>
          )}

          {rows && rows.length > 0 && (
            <View style={styles.list}>
              {rows.map((a, i) => (
                <View key={a.ticketId} style={[styles.row, i > 0 && styles.rowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{a.name}</Text>
                    <Text style={styles.meta}>{[a.seat, a.publicId ?? a.ticketId].filter(Boolean).join(' · ')}</Text>
                  </View>
                  {right(a)}
                </View>
              ))}
            </View>
          )}

          <Text style={styles.note}>Check the guest's ID before checking in by name.</Text>
        </ScrollView>

        <Button title="Back to scanner" variant="dark" onPress={() => navigation.goBack()} />
      </View>

      <Modal visible={!!undoFor} animationType="slide" onRequestClose={() => setUndoFor(null)}>
        <SafeAreaView style={styles.safe}>
          <ScreenHeader title={title} onBack={() => setUndoFor(null)} />
          {undoFor && (
            <UndoCheckIn result={asResult(undoFor)} onConfirm={confirmUndo} onCancel={() => setUndoFor(null)} />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  input: {
    minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.cardBorder,
    backgroundColor: colors.secondary, color: colors.text, paddingHorizontal: 16, fontSize: 16,
  },
  kicker: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  list: { backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  name: { color: colors.text, fontSize: 15, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 13, marginTop: 3 },
  note: { color: colors.muted, fontSize: 13 },
  error: { color: '#FF9B94', fontSize: 15 },
});
