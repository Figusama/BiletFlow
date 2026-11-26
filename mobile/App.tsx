import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ScannerScreen from './src/screens/ScannerScreen';
import SearchScreen from './src/screens/SearchScreen';
import EventDetailsScreen from './src/screens/EventDetailsScreen';
import TicketDetailScreen from './src/screens/TicketDetailScreen';
import WebScreen from './src/screens/WebScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import MyEventScreen from './src/screens/MyEventScreen';
import AdminQueueScreen from './src/screens/AdminQueueScreen';
import AdminUsersScreen from './src/screens/AdminUsersScreen';
import AdminEventsScreen from './src/screens/AdminEventsScreen';
import { loadToken, setToken, setOnAuthLost } from './src/api/client';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator();

export default function App() {
  const [ready, setReady] = useState(false);
  const [token, setTok] = useState<string | null>(null);

  useEffect(() => {
    setOnAuthLost(() => setTok(null));
    (async () => {
      try { setTok(await loadToken()); } catch {}
      setReady(true);
    })();
  }, []);

  const login = async (t: string) => { await setToken(t); setTok(t); };
  const logout = async () => { await setToken(null); setTok(null); };

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={{ ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.bg } }}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {token ? (
            <>
              <Stack.Screen name="Home">{(p: any) => <HomeScreen {...p} onLogout={logout} />}</Stack.Screen>
              <Stack.Screen name="Scanner" component={ScannerScreen} />
              <Stack.Screen name="Search" component={SearchScreen} />
              <Stack.Screen name="EventDetails" component={EventDetailsScreen} />
              <Stack.Screen name="TicketDetail" component={TicketDetailScreen} />
              <Stack.Screen name="Web" component={WebScreen} />
              <Stack.Screen name="Checkout" component={CheckoutScreen} />
              <Stack.Screen name="MyEvent" component={MyEventScreen} />
              <Stack.Screen name="AdminQueue" component={AdminQueueScreen} />
              <Stack.Screen name="AdminUsers" component={AdminUsersScreen} />
              <Stack.Screen name="AdminEvents" component={AdminEventsScreen} />
            </>
          ) : (
            <Stack.Screen name="Login">{() => <LoginScreen onLoggedIn={login} />}</Stack.Screen>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
