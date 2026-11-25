import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, fonts } from '../theme';
import { ScanResult } from '../types';

type Tone = 'green' | 'amber' | 'red' | 'neutral';

export const META: Record<string, { title: string; icon: string; tone: Tone }> = {
  valid: { title: 'Valid', icon: '✓', tone: 'green' },
  already_used: { title: 'Already used', icon: '!', tone: 'amber' },
  refunded: { title: 'Refunded', icon: '✕', tone: 'red' },
  cancelled: { title: 'Cancelled', icon: '✕', tone: 'red' },
  invalid: { title: 'Not recognised', icon: '?', tone: 'red' },
  campaign_qr: { title: 'Not a ticket', icon: '✕', tone: 'red' },
  wrong_event: { title: 'Other event', icon: '✕', tone: 'red' },
  event_cancelled: { title: 'Event cancelled', icon: '✕', tone: 'red' },
  event_not_active: { title: 'Event has ended', icon: '◷', tone: 'neutral' },
  event_suspended: { title: 'Check-in paused', icon: '!', tone: 'red' },
};

const BG: Record<Tone, string> = {
  green: colors.green,
  amber: colors.amber,
  red: colors.red,
  neutral: colors.neutralCard,
};

// Цвет рамки в окне камеры
const FRAME: Record<Tone, string> = {
  green: '#8FCBA6',
  amber: '#E9B25C',
  red: '#EBA29C',
  neutral: '#B9A0EA',
};

export function frameColor(status?: string): string {
  if (!status) return colors.accentLight;
  return FRAME[(META[status] ?? META.invalid).tone];
}

export default function ResultCard({ result }: { result: ScanResult }) {
  const m = META[result.status] ?? META.invalid;
  const id = result.publicId ?? result.ticketId;
  return (
    <View style={[styles.card, { backgroundColor: BG[m.tone] }]} accessibilityRole="alert">
      <View style={styles.row}>
        <View style={styles.icon}>
          <Text style={styles.iconText}>{m.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{m.title}</Text>
          {!!result.message && <Text style={styles.msg}>{result.message}</Text>}
        </View>
      </View>
      {!!result.attendee && <Text style={styles.name}>{result.attendee}</Text>}
      {!!result.seat && <Text style={styles.seat}>{result.seat}</Text>}
      {!!id && <Text style={styles.id}>{id}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: 18 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  msg: { color: 'rgba(255,255,255,0.92)', fontSize: 15, marginTop: 2, lineHeight: 21 },
  name: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 14 },
  seat: { color: '#fff', fontSize: 15, marginTop: 2 },
  id: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4, fontFamily: fonts.mono },
});
