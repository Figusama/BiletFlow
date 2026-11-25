import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import Badge from '../components/Badge';
import ScreenHeader from '../components/ScreenHeader';
import { colors, fonts } from '../theme';
import { fmtDateTime } from '../format';
import { STATUS_BADGE } from './TicketsScreen';

const NOTE: Record<string, string> = {
  VALID: 'Show this QR code at the entrance.',
  CHECKED_IN: 'This ticket was already used to enter.',
  CANCELLED: 'This ticket was cancelled and does not admit.',
  REFUNDED: 'This ticket was refunded and does not admit.',
};

export default function TicketDetailScreen({ route, navigation }: any) {
  const { ticket: t } = route.params;
  const valid = t.status === 'VALID';
  const b = STATUS_BADGE[t.status] ?? STATUS_BADGE.VALID;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Ticket" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View style={styles.ticket}>
          <View style={styles.top}>
            <Text style={styles.date}>{fmtDateTime(t.startsAt, t.timezone).toUpperCase()}</Text>
            <Text style={styles.title}>{t.eventTitle}</Text>
            <Text style={styles.sub}>{t.venueName}</Text>
          </View>

          <View style={styles.perf} />

          <View style={styles.qrWrap}>
            <View style={{ opacity: valid ? 1 : 0.2 }}>
              <QRCode value={t.qrPayload || 'invalid'} size={220} backgroundColor="#FFFFFF" color="#251D38" />
            </View>
            <Text style={styles.id}>{t.publicId}</Text>
            <Badge label={b.label} tone={b.tone} />
            <Text style={styles.note}>{NOTE[t.status] ?? ''}</Text>
          </View>
        </View>

        <View style={styles.info}>
          <Row label="Guest" value={t.attendeeName} />
          <Row label="Ticket type" value={t.ticketTypeName} />
          {!!t.seatLabel && <Row label="Seat" value={t.seatLabel} />}
          <Row label="Order" value={t.orderNumber} mono />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, mono && { fontFamily: fonts.mono }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  ticket: { backgroundColor: colors.white, borderRadius: 24, overflow: 'hidden' },
  top: { padding: 20, gap: 4 },
  date: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  sub: { color: '#544B63', fontSize: 14 },
  perf: { borderTopWidth: 2, borderStyle: 'dashed', borderColor: '#B8ABC8', marginHorizontal: 16 },
  qrWrap: { alignItems: 'center', padding: 24, gap: 12 },
  id: { color: colors.ink, fontFamily: fonts.mono, fontSize: 15, fontWeight: '700' },
  note: { color: '#544B63', fontSize: 14, textAlign: 'center' },
  info: { backgroundColor: colors.card, borderRadius: 24, paddingHorizontal: 18, borderWidth: 1, borderColor: colors.cardBorder },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, gap: 12 },
  label: { color: colors.muted, fontSize: 14 },
  value: { color: colors.text, fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
});
