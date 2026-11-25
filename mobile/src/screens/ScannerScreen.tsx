import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import Button from '../components/Button';
import ResultCard, { frameColor } from '../components/ResultCard';
import ScreenHeader from '../components/ScreenHeader';
import UndoCheckIn from '../components/UndoCheckIn';
import { colors } from '../theme';
import { api } from '../api';
import { bumpDevice, deviceCount } from '../session';
import { EventItem, ScanResult } from '../types';

const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export default function ScannerScreen({ route, navigation }: any) {
  const { eventId } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const lock = useRef(false);

  const refresh = async () => {
    try {
      setEvent(await api.getEvent(eventId));
    } catch {}
  };
  useEffect(() => {
    refresh();
  }, []);

  const onScanned = async ({ data }: { data: string }) => {
    if (lock.current) return; // не обрабатываем один код много раз подряд
    lock.current = true;
    setBusy(true);
    try {
      const r = await api.scan(eventId, data);
      if (r.status === 'valid') bumpDevice(eventId, 1);
      setResult(r);
      Haptics.notificationAsync(
        r.status === 'valid' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
      refresh();
    } catch (e: any) {
      setResult({ status: 'invalid', message: e.message || 'Network error' });
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    setResult(null);
    setUndoOpen(false);
    lock.current = false;
  };

  const confirmUndo = async (reason: string) => {
    try {
      if (result?.ticketId) {
        await api.undo(eventId, result.ticketId, reason);
        bumpDevice(eventId, -1);
      }
      refresh();
      next();
    } catch (e: any) {
      Alert.alert('Could not undo', e.message || 'Try again');
    }
  };

  const goSearch = () => navigation.navigate('Search', { eventId });
  const callLead = () =>
    Alert.alert('Event lead', 'Ask your event lead or the organizer to decide about this guest.');

  const title = event ? `${event.title}${event.gate ? ' · ' + event.gate : ''}` : '';

  if (!permission) return <View style={styles.safe} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.safe, { padding: 24, justifyContent: 'center' }]}>
        <Text style={styles.h}>Camera access needed</Text>
        <Text style={styles.sub}>Allow the camera to scan ticket QR codes.</Text>
        <View style={{ height: 20 }} />
        <Button title="Allow camera" onPress={requestPermission} />
      </SafeAreaView>
    );
  }

  const status = result?.status;
  const closed = status === 'event_not_active' || status === 'event_suspended';

  const footer = () => {
    if (!result) return <Button title="Find by name or ticket ID" variant="dark" onPress={goSearch} />;
    if (closed) return <Button title="Back to my events" variant="dark" onPress={() => navigation.navigate('Home')} />;
    return (
      <>
        <Button title="Scan next" onPress={next} />
        {status === 'valid' && !!result.ticketId && (
          <Button title="Undo check-in…" variant="dark" onPress={() => setUndoOpen(true)} />
        )}
        {status === 'already_used' && <Button title="Call the event lead" variant="dark" onPress={callLead} />}
        {(status === 'invalid' || status === 'campaign_qr' || status === 'refunded') && (
          <Button title="Find by name or ticket ID" variant="dark" onPress={goSearch} />
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />

      {undoOpen && result ? (
        <UndoCheckIn result={result} onConfirm={confirmUndo} onCancel={() => setUndoOpen(false)} />
      ) : (
        <View style={styles.body}>
          <View style={{ gap: 14 }}>
            {!result && event && (
              <View style={styles.counters}>
                <Text style={styles.small}>Checked in {fmt(event.checkedIn)} / {fmt(event.total)}</Text>
                <Text style={styles.small}>This device {deviceCount(eventId)}</Text>
              </View>
            )}

            <View style={[styles.cameraBox, result && { height: 240 }]}>
              {!result && (
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={onScanned}
                />
              )}
              <View style={[styles.frame, { borderColor: frameColor(status) }]} />
              {!result && <Text style={styles.hint}>{busy ? 'Checking…' : 'Point the camera at a ticket QR'}</Text>}
            </View>

            {result && <ResultCard result={result} />}
          </View>

          <View style={{ gap: 10 }}>{footer()}</View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  counters: { flexDirection: 'row', justifyContent: 'space-between' },
  small: { color: colors.muted, fontSize: 14 },
  cameraBox: {
    height: 340, borderRadius: 28, overflow: 'hidden', backgroundColor: colors.camera,
    alignItems: 'center', justifyContent: 'center',
  },
  frame: { width: 200, height: 200, borderRadius: 28, borderWidth: 3 },
  hint: { position: 'absolute', bottom: 14, color: '#fff', fontSize: 14 },
  sub: { color: colors.muted, fontSize: 16, marginTop: 6 },
  h: { color: colors.text, fontSize: 26, fontWeight: '800' },
});
