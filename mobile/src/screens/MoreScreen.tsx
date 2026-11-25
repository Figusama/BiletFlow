import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/Button';
import { colors, radius } from '../theme';
import { WEB_ROUTES } from '../config';
import { BASE_URL } from '../api/client';

export default function MoreScreen({ navigation, onLogout }: any) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>More</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text style={styles.kicker}>ON THE WEBSITE</Text>
        {WEB_ROUTES.map((r) => (
          <Pressable
            key={r.key}
            style={styles.link}
            onPress={() => navigation.navigate('Web', { title: r.title, path: r.path })}
          >
            <Text style={styles.linkIcon}>{r.icon}</Text>
            <Text style={styles.linkText}>{r.title}</Text>
            <Text style={styles.linkArrow}>›</Text>
          </Pressable>
        ))}

        <View style={{ height: 8 }} />
        <Button title="Sign out" variant="dark" onPress={onLogout} />
        <Text style={styles.server}>Server: {BASE_URL}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 8 },
  logo: { color: colors.text, fontSize: 26, fontWeight: '900' },
  kicker: { color: colors.text, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  link: { flexDirection: 'row', alignItems: 'center', minHeight: 56, backgroundColor: colors.card, borderRadius: radius.field, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 16, gap: 12 },
  linkIcon: { fontSize: 22 },
  linkText: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
  linkArrow: { color: colors.muted, fontSize: 24 },
  server: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 6 },
});
