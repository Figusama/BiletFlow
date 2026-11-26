import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';
import Icon, { IconName } from './Icon';

export type TabKey = 'discover' | 'tickets' | 'inbox' | 'events' | 'admin' | 'more';

export const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'discover', label: 'Discover', icon: 'search' },
  { key: 'tickets', label: 'Tickets', icon: 'ticket' },
  { key: 'inbox', label: 'Inbox', icon: 'bell' },
  { key: 'events', label: 'My events', icon: 'calendar' },
  { key: 'more', label: 'More', icon: 'menu' },
];

// Вкладка Admin вставляется перед More и только для PLATFORM_ADMIN.
export const ADMIN_TAB = { key: 'admin' as TabKey, label: 'Admin', icon: 'shield' as IconName };

export const tabsFor = (isAdmin: boolean) =>
  isAdmin ? [...TABS.slice(0, -1), ADMIN_TAB, TABS[TABS.length - 1]] : TABS;

type Props = {
  active: TabKey;
  onChange: (k: TabKey) => void;
  bottomInset?: number;
  isAdmin?: boolean;
  badges?: Partial<Record<TabKey, number>>;
};

export default function TabBar({ active, onChange, bottomInset = 0, isAdmin = false, badges = {} }: Props) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, 8) }]}>
      {tabsFor(isAdmin).map((t) => {
        const on = t.key === active;
        const n = badges[t.key] ?? 0;
        return (
          <Pressable
            key={t.key}
            style={styles.item}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <View>
              <Icon name={t.icon} size={22} color={on ? colors.accentLight : colors.muted} strokeWidth={on ? 2.4 : 2} />
              {n > 0 && (
                <View style={styles.badge} accessibilityLabel={`${n} unread`}>
                  <Text style={styles.badgeText}>{n > 9 ? '9+' : n}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 8 },
  item: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  labelOn: { color: colors.accentLight },
  badge: { position: 'absolute', top: -4, right: -10, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
