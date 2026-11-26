import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { useOnline } from '../session';
import Icon from './Icon';

export default function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const online = useOnline();
  return (
    <View style={styles.row}>
      <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back">
        <Icon name="arrowLeft" size={24} color={colors.text} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={[styles.pill, !online && styles.pillOff]}>
        <Text style={[styles.pillText, !online && styles.pillTextOff]}>{online ? 'Online' : 'Offline'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10, gap: 12 },
  title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  pill: { backgroundColor: colors.greenBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pillOff: { backgroundColor: colors.redBg },
  pillText: { color: colors.greenText, fontWeight: '700', fontSize: 13 },
  pillTextOff: { color: colors.redText },
});
