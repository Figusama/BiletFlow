import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import Button from './Button';
import { colors, radius } from '../theme';

type Props = {
  visible: boolean;
  title: string;
  hint?: string;
  confirmLabel: string;
  minLength?: number;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (text: string) => void;
};

// Окно с полем «причина». Кнопка подтверждения неактивна, пока текст короче minLength.
export default function PromptModal({ visible, title, hint, confirmLabel, minLength = 3, busy, onCancel, onSubmit }: Props) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (visible) setText('');
  }, [visible]);
  const ok = text.trim().length >= minLength;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          {!!hint && <Text style={styles.hint}>{hint}</Text>}
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={`At least ${minLength} characters`}
            placeholderTextColor={colors.muted}
            multiline
            maxLength={500}
            autoFocus
            accessibilityLabel="Reason"
          />
          <View style={{ gap: 10, marginTop: 14 }}>
            <Button title={confirmLabel} onPress={() => onSubmit(text.trim())} disabled={!ok} loading={busy} />
            <Button title="Cancel" variant="dark" onPress={onCancel} disabled={busy} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 'rgba(10,7,18,0.75)', justifyContent: 'center', padding: 20 },
  box: { backgroundColor: colors.card, borderRadius: radius.card, padding: 20, borderWidth: 1, borderColor: colors.cardBorder },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 14, marginTop: 6 },
  input: {
    marginTop: 14, minHeight: 90, color: colors.text, backgroundColor: colors.bg, borderRadius: radius.field,
    borderWidth: 1, borderColor: colors.cardBorder, padding: 12, fontSize: 16, textAlignVertical: 'top',
  },
});
