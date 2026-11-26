import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/Button';
import ScreenHeader from '../components/ScreenHeader';
import { colors, radius } from '../theme';
import { fmtPrice } from '../format';
import {
  CartLine, Order, Payment, buildAttendees, cancelOrder, cartTotal, createOrder, decideSimulated, fmtCountdown, getMyName, releaseReservation,
  resolvePaymentUrl, secondsLeft, startPayment, validatePromo, waitForOrder,
} from '../api/checkout';

type Step = 'review' | 'simulator' | 'confirming' | 'waiting' | 'done' | 'failed';

// Покупка: проверка корзины → заказ → оплата (симулятор прямо в приложении, реальная — в WebView) → билеты.
export default function CheckoutScreen({ route, navigation }: any) {
  const { eventTitle, reservationId, expiresAt, lines } = route.params as {
    eventTitle: string; reservationId: string; expiresAt: string; lines: CartLine[];
  };
  const [step, setStep] = useState<Step>('review');
  const [left, setLeft] = useState<number | null>(secondsLeft(expiresAt));
  const [promo, setPromo] = useState('');
  const [promoMsg, setPromoMsg] = useState('');
  const [promoOk, setPromoOk] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const [payUrl, setPayUrl] = useState<string | undefined>();
  const [names, setNames] = useState<Record<string, string[]>>({});
  const [myName, setMyName] = useState('');
  const key = useRef(`bf-${reservationId}-${Date.now()}`);

  const subtotal = cartTotal(lines);
  const total = order ? order.totalMinor : Math.max(0, subtotal - discount);
  const expired = step === 'review' && left === 0;

  // имя покупателя подставляется в билеты, где имя посетителя не введено
  useEffect(() => {
    getMyName().then(setMyName).catch(() => {});
  }, []);

  const setName = (typeId: string, index: number, value: string) =>
    setNames((cur) => {
      const list = [...(cur[typeId] ?? [])];
      list[index] = value;
      return { ...cur, [typeId]: list };
    });

  // обратный отсчёт резервации (только пока заказ не создан)
  useEffect(() => {
    if (step !== 'review') return;
    const t = setInterval(() => setLeft(secondsLeft(expiresAt)), 1000);
    return () => clearInterval(t);
  }, [step, expiresAt]);

  const leave = () => {
    if (step === 'review') releaseReservation(reservationId).catch(() => {});
    navigation.goBack();
  };

  const applyPromo = async () => {
    if (!promo.trim()) return;
    setBusy(true);
    try {
      const r = await validatePromo(promo, reservationId);
      setPromoOk(r.valid);
      setPromoMsg(r.message);
      setDiscount(r.valid ? r.discountMinor : 0);
    } catch (e: any) {
      setPromoOk(false);
      setPromoMsg(e.message || 'Could not check the promo code');
      setDiscount(0);
    } finally {
      setBusy(false);
    }
  };

  const finish = async (o: Order) => {
    setStep('confirming');
    setCanRetry(false);
    const final = await waitForOrder(o.id);
    setOrder(final);
    if (final.status === 'CONFIRMED') setStep('done');
    else if (final.status === 'PENDING' && payUrl) {
      // оплата на внешней странице ещё не подтверждена: остаёмся на экране ожидания
      setMessage('We have not received the payment confirmation yet. If you paid, wait a few seconds and check again.');
      setStep('waiting');
    } else {
      setMessage(
        final.status === 'PENDING'
          ? 'We have not received the payment confirmation yet. Check Tickets in a minute.'
          : 'The payment was not completed, so the order was not confirmed.',
      );
      setStep('failed');
    }
  };

  const pay = async (o: Order) => {
    const p = await startPayment(o.id, key.current);
    setPayment(p);
    if (p.isSimulated) {
      setStep('simulator');
      return;
    }
    const url = resolvePaymentUrl(p.paymentUrl);
    if (!url) throw new Error('The payment page is not available. Try again later.');
    setPayUrl(url);
    setMessage('');
    setStep('waiting');
    navigation.navigate('Web', { title: 'Payment', url, closeOnReturn: true });
  };

  const placeOrder = async () => {
    setBusy(true);
    try {
      const o = await createOrder(reservationId, promoOk ? promo : undefined, buildAttendees(lines, names, myName));
      setOrder(o);
      if (o.requiresPayment) await pay(o);
      else await finish(o);
    } catch (e: any) {
      Alert.alert('Could not place the order', e.message || 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (outcome: 'approve' | 'decline') => {
    if (!payment || !order) return;
    setBusy(true);
    try {
      const p = await decideSimulated(payment.id, outcome);
      if (p.status === 'FAILED' || p.status === 'CANCELLED') {
        // отказ: заказ ещё жив, оплату можно повторить
        setMessage('The payment was declined. You can try again.');
        setCanRetry(true);
        setStep('failed');
      } else {
        await finish(order);
      }
    } catch (e: any) {
      Alert.alert('Payment error', e.message || 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!order) return;
    setBusy(true);
    try {
      key.current = `bf-${reservationId}-${Date.now()}`;
      await pay(order);
    } catch (e: any) {
      Alert.alert('Could not start the payment', e.message || 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (order) await cancelOrder(order.id).catch(() => {});
    navigation.goBack();
  };

  // вернулись со страницы оплаты (WebView закрылся): проверяем заказ сами
  useEffect(() => {
    if (step !== 'waiting' || !order) return;
    return navigation.addListener('focus', () => {
      finish(order);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, order]);

  const goTickets = () => navigation.navigate('Home', { tab: 'tickets', at: Date.now() });

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Checkout" onBack={step === 'review' ? leave : step === 'done' ? goTickets : cancel} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>{eventTitle}</Text>

        {step === 'review' && (
          <>
            {left !== null && (
              <Text style={[styles.timer, expired && { color: '#FFB4AE' }]}>
                {expired ? 'Reservation expired' : `Tickets are held for ${fmtCountdown(left)}`}
              </Text>
            )}
            <View style={styles.card}>
              {lines.map((l) => (
                <View key={l.ticketTypeId} style={styles.row}>
                  <Text style={styles.line}>{l.quantity} × {l.name}</Text>
                  <Text style={styles.line}>{fmtPrice(l.unitPriceMinor * l.quantity)}</Text>
                </View>
              ))}
              {discount > 0 && (
                <View style={styles.row}>
                  <Text style={[styles.line, { color: colors.accentLight }]}>Promo discount</Text>
                  <Text style={[styles.line, { color: colors.accentLight }]}>−{fmtPrice(discount)}</Text>
                </View>
              )}
              <View style={[styles.row, styles.totalRow]}>
                <Text style={styles.total}>Total</Text>
                <Text style={styles.total}>{fmtPrice(total)}</Text>
              </View>
            </View>

            <Text style={styles.kicker}>NAMES ON TICKETS (OPTIONAL)</Text>
            {lines.map((l) =>
              Array.from({ length: l.quantity }).map((_, i) => (
                <TextInput
                  key={`${l.ticketTypeId}-${i}`}
                  style={styles.input}
                  value={names[l.ticketTypeId]?.[i] ?? ''}
                  onChangeText={(t) => setName(l.ticketTypeId, i, t)}
                  placeholder={`${l.name} #${i + 1}${myName ? ` (default: ${myName})` : ''}`}
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  autoCorrect={false}
                  accessibilityLabel={`Name for ${l.name} ticket ${i + 1}`}
                />
              )),
            )}

            <Text style={styles.kicker}>PROMO CODE</Text>
            <View style={styles.promoRow}>
              <TextInput
                style={styles.input}
                value={promo}
                onChangeText={(t) => { setPromo(t); setPromoOk(false); setPromoMsg(''); setDiscount(0); }}
                placeholder="Enter code"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel="Promo code"
              />
              <View style={{ width: 110 }}>
                <Button title="Apply" variant="dark" onPress={applyPromo} disabled={!promo.trim() || busy || expired} />
              </View>
            </View>
            {!!promoMsg && <Text style={[styles.note, { color: promoOk ? colors.accentLight : '#FFB4AE' }]}>{promoMsg}</Text>}

            <Button
              title={total === 0 ? 'Get tickets' : `Pay ${fmtPrice(total)}`}
              onPress={placeOrder}
              loading={busy}
              disabled={expired}
            />
            <Button title="Cancel" variant="dark" onPress={leave} disabled={busy} />
          </>
        )}

        {step === 'simulator' && payment && (
          <>
            <View style={styles.card}>
              <Text style={styles.kicker}>TEST PAYMENT (SIMULATOR)</Text>
              <Text style={styles.big}>{fmtPrice(payment.amountMinor)}</Text>
              <Text style={styles.note}>This is the local test environment. No real money is charged. Choose the payment result.</Text>
            </View>
            <Button title="Pay successfully" onPress={() => decide('approve')} loading={busy} />
            <Button title="Decline the payment" variant="dark" onPress={() => decide('decline')} disabled={busy} />
          </>
        )}

        {step === 'confirming' && <Text style={styles.note}>Confirming your order…</Text>}

        {step === 'waiting' && (
          <>
            <Text style={styles.note}>{message || 'Finish the payment on the opened page, then come back here.'}</Text>
            <Button title="I have paid, check status" onPress={() => order && finish(order)} />
            {!!payUrl && (
              <Button
                title="Open the payment page again"
                variant="ghost"
                onPress={() => navigation.navigate('Web', { title: 'Payment', url: payUrl, closeOnReturn: true })}
              />
            )}
            <Button title="Cancel the order" variant="dark" onPress={cancel} />
          </>
        )}

        {step === 'done' && (
          <>
            <View style={styles.card}>
              <Text style={styles.big}>You’re in!</Text>
              {!!order && <Text style={styles.note}>Order {order.number} is confirmed. Your tickets with QR codes are in the Tickets tab.</Text>}
            </View>
            <Button title="View my tickets" onPress={goTickets} />
          </>
        )}

        {step === 'failed' && (
          <>
            <View style={styles.card}>
              <Text style={styles.big}>Not completed</Text>
              <Text style={styles.note}>{message}</Text>
            </View>
            {canRetry && <Button title="Try the payment again" onPress={retry} loading={busy} />}
            <Button title="Back to the event" variant="dark" onPress={cancel} disabled={busy} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 24, fontWeight: '900' },
  timer: { color: colors.accentLight, fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.cardBorder, padding: 18, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  line: { color: colors.text, fontSize: 15 },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 10, marginTop: 4 },
  total: { color: colors.text, fontSize: 18, fontWeight: '900' },
  kicker: { color: colors.text, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  promoRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { flex: 1, height: 52, backgroundColor: colors.card, borderRadius: radius.field, borderWidth: 1, borderColor: colors.cardBorder, color: colors.text, paddingHorizontal: 14, fontSize: 16 },
  note: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  big: { color: colors.text, fontSize: 26, fontWeight: '900' },
});
