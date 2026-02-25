import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SocketProvider } from '../context/SocketContext';

export default function RootLayout() {
  return (
    <SocketProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#25262b' },
          headerTintColor: '#c1c2c5',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: '#1a1b1e' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="scan"
          options={{ title: 'Scan QR Code', presentation: 'modal' }}
        />
        <Stack.Screen
          name="terminals"
          options={{ title: 'Terminals', headerBackVisible: false }}
        />
        <Stack.Screen
          name="terminal/[id]"
          options={{ title: 'Terminal' }}
        />
      </Stack>
    </SocketProvider>
  );
}
