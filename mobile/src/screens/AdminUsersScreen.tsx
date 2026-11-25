import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import Badge from '../components/Badge';
import Button from '../components/Button';
import { colors, radius } from '../theme';
import { AdminUserRow, searchUsers, suspendUser, unsuspendUser } from '../api/admin';

export default function AdminUsersScreen({ navigation }: any) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (text: string) => {
    try {
      setError('');
      setRows(await searchUsers(text));
    } catch (e: any) {
      setError(e.message || 'Could not load');
    }
  }, []);

  // поиск с задержкой 400 мс после последней буквы
  useEffect(() => {
    const t = setTimeout(() => load(q), 400);
    return () => clearTimeout(t);
  }, [q, load]);

  const toggle = (u: AdminUserRow) => {
    const verb = u.suspended ? 'Restore' : 'Suspend';
    Alert.alert(`${verb} ${u.email}?`, u.suspended ? 'The user will be able to sign in again.' : 'The user will not be able to sign in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: verb,
        style: u.suspended ? 'default' : 'destructive',
        onPress: async () => {
          setBusyId(u.id);
          try {
            await (u.suspended ? unsuspendUser(u.id) : suspendUser(u.id));
            setRows((cur) => cur && cur.map((r) => (r.id === u.id ? { ...r, suspended: !u.suspended } : r)));
          } catch (e: any) {
            Alert.alert('Action failed', e.message || 'Try again');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Users" onBack={() => navigation.goBack()} />
      <View style={{ paddingHorizontal: 20 }}>
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder="Search by email or name"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
        {!rows && !error && <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {rows && rows.length === 0 && <Text style={styles.empty}>No users found.</Text>}
        {rows?.map((u) => (
          <View key={u.id} style={styles.card}>
            <View style={styles.top}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{u.name || u.email}</Text>
                {!!u.name && <Text style={styles.email}>{u.email}</Text>}
                <Text style={styles.pub}>{u.publicId}</Text>
              </View>
              <Badge label={u.suspended ? 'Suspended' : u.role === 'PLATFORM_ADMIN' ? 'Admin' : 'Active'} tone={u.suspended ? 'danger' : u.role === 'PLATFORM_ADMIN' ? 'info' : 'success'} />
            </View>
            {u.role !== 'PLATFORM_ADMIN' && (
              <View style={{ marginTop: 12 }}>
                <Button
                  title={u.suspended ? 'Restore access' : 'Suspend'}
                  variant={u.suspended ? 'primary' : 'dark'}
                  onPress={() => toggle(u)}
                  loading={busyId === u.id}
                  disabled={!!busyId}
                />
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  search: { backgroundColor: colors.card, borderRadius: radius.field, borderWidth: 1, borderColor: colors.cardBorder, color: colors.text, paddingHorizontal: 14, height: 48, fontSize: 16 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.cardBorder, padding: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' },
  email: { color: colors.muted, fontSize: 14, marginTop: 2 },
  pub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  error: { color: '#FFB4AE', textAlign: 'center' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 30 },
});
