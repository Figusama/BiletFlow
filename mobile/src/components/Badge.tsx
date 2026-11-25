import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type BadgeTone = 'success' | 'danger' | 'info' | 'neutral';

const TONES: Record<BadgeTone, { fg: string; bg: string; border: string }> = {
  success: { fg: '#1F7A4A', bg: '#EEF8F1', border: '#8FCBA6' },
  danger: { fg: '#B42A24', bg: '#FEF1EF', border: '#EBA29C' },
  info: { fg: '#1F66A6', bg: '#EDF5FC', border: '#7DA9D6' },
  neutral: { fg: '#4A4656', bg: '#F2F1F4', border: '#8E8A99' },
};

export default function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  text: { fontSize: 13, fontWeight: '700' },
});
