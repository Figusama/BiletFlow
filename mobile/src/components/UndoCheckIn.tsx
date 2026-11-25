import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Button from './Button';
import ResultCard from './ResultCard';
import { colors } from '../theme';
import { ScanResult } from '../types';

export const UNDO_REASONS = ['Scanned the wrong ticket', 'Guest left before entering', 'Other reason'];

type Props = {
  result: ScanResult;
  onConfirm: (reason: string) => Promise<void> | void;
  onCancel: () => void;
};

export default function UndoCheckIn({ result, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState(UNDO_REASONS[0]);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(reason);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.body}>
      <View style={{ gap: 14 }}>
        <View style={{ opacity: 0.55 }}>
          <ResultCard result={result} />
        </View>
        <View style={styles.sheet}>
          <Text style={styles.q}>Undo this check-in?</Text>
          <Text style={styles.p}>The ticket becomes valid again. The scan stays in history with your reason.</Text>
          {UNDO_REASONS.map((r) => {
            const on = reason === r;
            return (
              <Pressable
                key={r}
                style={[styles.opt, on && styles.optOn]}
                onPress={() => setReason(r)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.dot} />}</View>
                <Text style={styles.optText}>{r}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <Button title="Undo check-in" onPress={confirm} loading={busy} />
        <Button title="Keep it" variant="dark" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  sheet: { backgroundColor: colors.white, borderRadius: 24, padding: 18, gap: 10 },
  q: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  p: { color: '#544B63', fontSize: 15, lineHeight: 21, marginBottom: 4 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: '#E3DCE7', paddingHorizontal: 14 },
  optOn: { backgroundColor: '#EBE2F5', borderColor: colors.accent },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#8E7FA3', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.accent },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  optText: { color: colors.ink, fontSize: 16 },
});
