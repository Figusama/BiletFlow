import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/Button';
import { colors, radius } from '../theme';
import { api } from '../api';
import { setSessionEmail } from '../session';

export default function LoginScreen({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const r = await api.login(email.trim(), password);
      setSessionEmail(email.trim());
      onLoggedIn(r.token);
    } catch (e: any) {
      setError(e.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <Text style={styles.logo}>BiletFlow <Text style={styles.logoSub}>Check-in</Text></Text>
        <Text style={styles.kicker}>WELCOME BACK</Text>
        <Text style={styles.h1}>Sign in</Text>
        <Text style={styles.sub}>Use the email you verified.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.kz"
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••••"
          placeholderTextColor={colors.muted}
        />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <View style={{ height: 20 }} />
        <Button title="Sign in" onPress={submit} loading={loading} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  wrap: { flex: 1, padding: 24, justifyContent: 'center' },
  logo: { color: colors.accentLight, fontSize: 28, fontWeight: '900', marginBottom: 32 },
  logoSub: { color: colors.text, fontSize: 18, fontWeight: '500' },
  kicker: { color: colors.accentLight, fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  h1: { color: colors.text, fontSize: 40, fontWeight: '900', marginTop: 4 },
  sub: { color: colors.muted, fontSize: 16, marginTop: 6, marginBottom: 24 },
  label: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  input: {
    minHeight: 52, borderRadius: radius.field, borderWidth: 1, borderColor: colors.cardBorder,
    backgroundColor: colors.card, color: colors.text, paddingHorizontal: 16, fontSize: 17,
  },
  error: { color: '#FF9B94', fontSize: 15, marginTop: 12 },
});
