import { useEffect, useRef, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  interpolate,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { useSocket } from '../../context/SocketContext';
import TerminalWebView, {
  TerminalWebViewRef,
} from '../../components/TerminalWebView';

// Common special keys for mobile
const KEYS = [
  { label: 'ESC',  data: '\x1b' },
  { label: 'TAB',  data: '\t' },
  { label: '^C',   data: '\x03' },
  { label: '^D',   data: '\x04' },
  { label: '^Z',   data: '\x1a' },
  { label: 'CLR',  data: '\x0c' },       // Ctrl+L = clear screen
  { label: '↑',    data: '\x1b[A' },
  { label: '↓',    data: '\x1b[B' },
  { label: '←',    data: '\x1b[D' },
  { label: '→',    data: '\x1b[C' },
];

export default function TerminalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const termId = parseInt(id, 10);
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();

  const {
    terminals,
    authenticated,
    attachTerminal,
    detachTerminal,
    sendInput,
    resizeTerminal,
    subscribeToData,
  } = useSocket();

  const webViewRef = useRef<TerminalWebViewRef>(null);
  const navigation = useNavigation();
  const terminal = terminals.find((t) => t.id === termId);

  // Container shrinks by keyboard height — perfectly synced with iOS animation
  const containerStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboard.height.value,
  }));

  // Toolbar bottom padding: safe area when keyboard hidden, flat when shown
  const safeBottom = insets.bottom + (Platform.OS === 'ios' ? 8 : 6);
  const flatBottom = Platform.OS === 'ios' ? 8 : 6;
  const toolbarStyle = useAnimatedStyle(() => ({
    paddingBottom: interpolate(
      keyboard.height.value,
      [0, 1],
      [safeBottom, flatBottom],
      'clamp'
    ),
  }));

  // Redirect if not authenticated
  useEffect(() => {
    if (!authenticated) router.replace('/');
  }, [authenticated]);

  // Update header title when terminal info changes
  useEffect(() => {
    navigation.setOptions({
      title: terminal?.name ?? `Terminal ${termId}`,
      headerRight: () => (
        <TouchableOpacity onPress={() => webViewRef.current?.clear()} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Clear</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, terminal, termId]);

  // Subscribe to terminal output → push to WebView
  useEffect(() => {
    const unsubscribe = subscribeToData(termId, (data) => {
      webViewRef.current?.writeData(data);
    });
    return unsubscribe;
  }, [termId, subscribeToData]);

  // Attach terminal once the WebView xterm.js is ready
  const handleReady = useCallback(
    (cols: number, rows: number) => {
      // Reset xterm.js state before replaying scrollback to avoid stale escape sequences
      webViewRef.current?.reset();
      attachTerminal(termId, cols, rows);
    },
    [termId, attachTerminal]
  );

  // User typed in xterm.js → send to server
  const handleInput = useCallback(
    (data: string) => {
      sendInput(termId, data);
    },
    [termId, sendInput]
  );

  // xterm.js resized (keyboard shown/hidden, orientation) → notify server
  const handleResize = useCallback(
    (cols: number, rows: number) => {
      resizeTerminal(termId, cols, rows);
    },
    [termId, resizeTerminal]
  );

  // Detach when leaving the screen
  useEffect(() => {
    return () => {
      detachTerminal(termId);
    };
  }, [termId, detachTerminal]);

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Terminal */}
      <TerminalWebView
        ref={webViewRef}
        onInput={handleInput}
        onResize={handleResize}
        onReady={handleReady}
      />

      {/* Mobile key toolbar */}
      <Animated.View style={[styles.toolbar, toolbarStyle]}>
        <TouchableOpacity
          style={styles.keyScroll}
          onPress={() => {
            // scrollWheel works in TUI apps (tmux/gemini-cli)
            // scrollLines works in normal scrollback
            webViewRef.current?.scrollWheel(-100);
            webViewRef.current?.scrollLines(-5);
          }}
          activeOpacity={0.65}
        >
          <Ionicons name="chevron-up" size={16} color="#c1c2c5" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.keyScroll, styles.keyScrollBottom]}
          onPress={() => {
            webViewRef.current?.scrollWheel(100);
            webViewRef.current?.scrollLines(5);
          }}
          activeOpacity={0.65}
        >
          <Ionicons name="chevron-down" size={16} color="#c1c2c5" />
        </TouchableOpacity>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolbarContent}
          keyboardShouldPersistTaps="always"
        >
          {KEYS.map((key) => (
            <TouchableOpacity
              key={key.label}
              style={styles.key}
              onPress={() => handleInput(key.data)}
              activeOpacity={0.65}
            >
              <Text style={styles.keyText}>{key.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          style={styles.keyDismiss}
          onPress={() => webViewRef.current?.blur()}
          activeOpacity={0.65}
        >
          <Ionicons name="chevron-down" size={18} color="#c1c2c5" />
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1b1e' },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#25262b',
    borderTopWidth: 1,
    borderTopColor: '#373a40',
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
  },
  toolbarContent: {
    paddingHorizontal: 10,
    gap: 6,
    alignItems: 'center',
  },
  key: {
    backgroundColor: '#373a40',
    borderRadius: 7,
    paddingHorizontal: 13,
    paddingVertical: 7,
    minWidth: 42,
    alignItems: 'center',
  },
  keyText: {
    color: '#c1c2c5',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  keyScroll: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRightWidth: 1,
    borderRightColor: '#373a40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyScrollBottom: {
    borderRightWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: '#373a40',
    marginRight: 4,
  },

  keyDismiss: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderLeftWidth: 1,
    borderLeftColor: '#373a40',
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerBtn: { paddingHorizontal: 4 },
  headerBtnText: { color: '#4dabf7', fontSize: 14 },
});
