import { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSocket } from '../context/SocketContext';

export default function HomeScreen() {
  const { authenticated, connecting, paired, error, unpair } = useSocket();

  // Redirect to terminal list once authenticated
  useEffect(() => {
    if (authenticated) router.replace('/terminals');
  }, [authenticated]);

  // ── Connecting (saved credentials exist) ──────────────────────────────────
  if (paired && connecting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4dabf7" />
        <Text style={styles.hint}>Connecting…</Text>
      </View>
    );
  }

  // ── Connection error with saved credentials ────────────────────────────────
  if (paired && error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>⚠</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.hint}>Is the server running?</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/scan')}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Scan QR again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.link} onPress={unpair}>
          <Text style={styles.linkText}>Unpair this server</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Welcome screen (not yet paired) ───────────────────────────────────────
  return (
    <View style={styles.center}>
      <Text style={styles.logo}>{'> _'}</Text>
      <Text style={styles.title}>remote-control-ai</Text>
      <Text style={styles.subtitle}>
        Run{' '}
        <Text style={styles.code}>remote-control-ai connect {'<url>'}</Text>
        {'\n'}on your machine, then scan the QR code.
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push('/scan')}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>📷  Scan QR Code</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#1a1b1e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },

  logo: {
    fontSize: 36,
    color: '#4dabf7',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#c1c2c5',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#5c5f66',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
  },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#4dabf7',
    fontSize: 13,
  },

  hint: {
    color: '#5c5f66',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
  },

  errorIcon: { fontSize: 40, marginBottom: 16, color: "#ff6b6b" },
  errorText: {
    color: '#ff6b6b',
    fontSize: 15,
    textAlign: 'center',
    backgroundColor: '#ff6b6b18',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },

  button: {
    marginTop: 8,
    backgroundColor: '#4dabf7',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    minWidth: 220,
  },
  buttonText: { color: '#1a1b1e', fontSize: 16, fontWeight: '700' },

  link: { marginTop: 20 },
  linkText: { color: '#5c5f66', fontSize: 13, textDecorationLine: 'underline' },
});
