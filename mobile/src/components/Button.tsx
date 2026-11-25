import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'dark' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
};

export default function Button({ title, onPress, variant = 'primary', loading, disabled }: Props) {
  const bg = variant === 'primary' ? colors.accent : variant === 'dark' ? colors.secondary : 'transparent';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: pressed || disabled ? 0.7 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: colors.cardBorder },
      ]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.text}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  text: { color: colors.text, fontSize: 16, fontWeight: '700' },
});
