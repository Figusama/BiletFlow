import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, BackHandler, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView as RNWebView } from 'react-native-webview';
import Button from '../components/Button';
import { colors } from '../theme';
import { WEB_URL } from '../config';
import Icon from '../components/Icon';
import { isPaymentReturn } from '../api/checkout';

// Приведение типа: у react-native-webview бывают конфликты типов с @types/react
const WebView = RNWebView as unknown as React.ComponentType<any>;

export default function WebScreen({ route, navigation }: any) {
  const { title, path, url, closeOnReturn } = route.params;
  const closed = useRef(false);
  const ref = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const goBack = () => {
    if (canGoBack) ref.current?.goBack();
    else navigation.goBack();
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) { ref.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const reload = () => { setError(false); setLoading(true); ref.current?.reload(); };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <Pressable onPress={goBack} hitSlop={12} accessibilityLabel="Back"><Icon name="chevronLeft" size={28} color={colors.text} /></Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Pressable onPress={reload} hitSlop={12} accessibilityLabel="Reload"><Icon name="refresh" size={22} color={colors.text} /></Pressable>
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errTitle}>Could not load the website</Text>
          <Text style={styles.errText}>Check Wi-Fi and the website address ({WEB_URL}). The site must run with --host.</Text>
          <View style={{ height: 16 }} />
          <Button title="Try again" onPress={reload} />
        </View>
      ) : (
        <WebView
          ref={ref}
          source={{ uri: url ?? WEB_URL + path }}
          style={{ flex: 1, backgroundColor: colors.bg }}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsBackForwardNavigationGestures
          onNavigationStateChange={(s: any) => {
            setCanGoBack(s.canGoBack);
            // страница оплаты вернула пользователя на сайт: закрываем WebView, экран оплаты сам проверит заказ
            if (closeOnReturn && !closed.current && s.url && isPaymentReturn(s.url)) {
              closed.current = true;
              navigation.goBack();
            }
          }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => setError(true)}
          onHttpError={(e: any) => { if (e.nativeEvent.statusCode >= 500) setError(true); }}
          onShouldStartLoadWithRequest={(req: any) => {
            if (/^(mailto|tel):/i.test(req.url)) { Linking.openURL(req.url); return false; }
            return true;
          }}
        />
      )}
      {loading && !error && (
        <View style={styles.loader} pointerEvents="none"><ActivityIndicator color="#fff" /></View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  center: { flex: 1, padding: 24, justifyContent: 'center' },
  errTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  errText: { color: colors.muted, fontSize: 16, marginTop: 8 },
  loader: { position: 'absolute', top: 70, alignSelf: 'center' },
});
