import { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useNavigation } from 'expo-router';
import { useSocket } from '../context/SocketContext';

export default function TerminalsScreen() {
  const { terminals, authenticated, connected, createTerminal, killTerminal, unpair } =
    useSocket();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!authenticated) router.replace('/');
  }, [authenticated]);

  // Header: connection status dot + logout button
  useEffect(() => {
    navigation.setOptions({
      title: `Terminals${terminals.length ? ` (${terminals.length})` : ''}`,
      headerRight: () => (
        <TouchableOpacity onPress={handleLogout} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Unpair</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, terminals.length]);

  const handleLogout = () => {
    Alert.alert('Unpair', 'Clear saved credentials and disconnect?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unpair', style: 'destructive', onPress: unpair },
    ]);
  };

  const handleOpen = (id: number) => router.push(`/terminal/${id}`);

  const handleKill = (id: number, name: string) => {
    Alert.alert('Kill terminal', `Kill "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Kill', style: 'destructive', onPress: () => killTerminal(id) },
    ]);
  };

  const handleCreate = () => {
    Alert.prompt(
      'New terminal',
      'Name (optional)',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create', onPress: (name?: string) => createTerminal(name || undefined) },
      ],
      'plain-text',
      '',
      'default'
    );
  };

  // On Android, Alert.prompt doesn't exist — fallback to unnamed terminal
  const handleCreateSafe = () => {
    if (Platform.OS === 'ios') {
      handleCreate();
    } else {
      createTerminal();
    }
  };

  return (
    <View style={styles.container}>
      {/* Connection status */}
      <View style={styles.statusBar}>
        <View style={[styles.dot, connected ? styles.dotGreen : styles.dotRed]} />
        <Text style={styles.statusText}>
          {connected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>

      {terminals.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>{'⬡'}</Text>
          <Text style={styles.emptyText}>No active terminals</Text>
          <Text style={styles.emptyHint}>
            Tap{' '}
            <Text style={{ color: '#4dabf7' }}>+</Text>
            {' '}to create one, or open tmux on your machine
          </Text>
        </View>
      ) : (
        <FlatList
          data={[...terminals].reverse()}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.item}
              onPress={() => handleOpen(item.id)}
              onLongPress={() => handleKill(item.id, item.name)}
              activeOpacity={0.7}
            >
              <View style={styles.itemLeft}>
                <View style={styles.itemIconWrap}>
                  <Text style={styles.itemIcon}>{item.isTmux ? '⬡' : '$'}</Text>
                </View>
                <View>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {item.isTmux ? 'tmux' : 'shell'} · ID {item.id}
                  </Text>
                </View>
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: 24 + insets.bottom }]}
        onPress={handleCreateSafe}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1b1e' },

  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#373a40',
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotGreen: { backgroundColor: '#69db7c' },
  dotRed: { backgroundColor: '#ff6b6b' },
  statusText: { color: '#5c5f66', fontSize: 13 },

  list: { padding: 16, gap: 10 },

  item: {
    backgroundColor: '#25262b',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#373a40',
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  itemIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#4dabf718',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemIcon: { fontSize: 18, color: '#4dabf7' },
  itemName: { color: '#c1c2c5', fontSize: 15, fontWeight: '500', maxWidth: 220 },
  itemMeta: { color: '#5c5f66', fontSize: 12, marginTop: 2 },
  arrow: { color: '#373a40', fontSize: 22 },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16, color: "white" },
  emptyText: { color: '#c1c2c5', fontSize: 18, fontWeight: '600', marginBottom: 10 },
  emptyHint: { color: '#5c5f66', fontSize: 14, textAlign: 'center', lineHeight: 20 },

  fab: {
    position: 'absolute',
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4dabf7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4dabf7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  fabText: { color: '#1a1b1e', fontSize: 30, fontWeight: '700', lineHeight: 34 },

  headerBtn: { paddingHorizontal: 4 },
  headerBtnText: { color: '#ff6b6b', fontSize: 14 },
});
