import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSocket } from '../context/SocketContext';

type QRPayload = { u: string; t: string };

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const { connect, authenticated, error, connecting } = useSocket();

  // Redirect to terminal list once authenticated
  useEffect(() => {
    if (authenticated) router.replace('/terminals');
  }, [authenticated]);

  // Show socket error on screen and allow retry
  useEffect(() => {
    if (scanned && !connecting && !authenticated && error) {
      setScanError(error);
      setTimeout(() => {
        setScanned(false);
        setScanError(null);
      }, 3000);
    }
  }, [error, connecting, authenticated, scanned]);

  const handleBarcode = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setScanError(null);

    try {
      const payload: QRPayload = JSON.parse(data);
      if (!payload.u || !payload.t) throw new Error('Invalid QR');
      connect(payload.u, payload.t);
    } catch {
      setScanError('Unrecognized QR — generate it with:\nremote-control-ai connect <url>');
      setTimeout(() => {
        setScanned(false);
        setScanError(null);
      }, 2500);
    }
  };

  // ── Permission loading ─────────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Requesting camera permission…</Text>
      </View>
    );
  }

  // ── Permission denied ──────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Camera access denied</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow camera access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Scanner ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={scanned ? undefined : handleBarcode}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      {/* Dark overlay with scan window */}
      <View style={styles.overlay}>
        <View style={styles.topMask} />
        <View style={styles.middle}>
          <View style={styles.sideMask} />
          <View style={styles.frame}>
            {/* Frame corners */}
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
          <View style={styles.sideMask} />
        </View>
        <View style={styles.bottomMask}>
          {scanError ? (
            <Text style={styles.errorText}>{scanError}</Text>
          ) : scanned ? (
            <Text style={styles.successText}>✓ Connecting…</Text>
          ) : (
            <Text style={styles.hint}>
              Point the camera at the QR code displayed in your terminal
            </Text>
          )}
          <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const FRAME      = 260;
const MASK_ALPHA = 'rgba(0,0,0,0.62)';
const CORNER     = 24;
const BORDER     = 3;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: '#1a1b1e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },

  // ── Overlay ───────────────────────────────────────────────────────────────
  overlay:    { flex: 1 },
  topMask:    { flex: 1, backgroundColor: MASK_ALPHA },
  middle:     { flexDirection: 'row', height: FRAME },
  sideMask:   { flex: 1, backgroundColor: MASK_ALPHA },
  bottomMask: {
    flex: 1.2,
    backgroundColor: MASK_ALPHA,
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 32,
    gap: 20,
  },

  // ── Scan frame ────────────────────────────────────────────────────────────
  frame:  { width: FRAME, height: FRAME, position: 'relative' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#4dabf7' },
  tl: { top: 0,    left: 0,  borderTopWidth: BORDER,    borderLeftWidth: BORDER,  borderTopLeftRadius: 4 },
  tr: { top: 0,    right: 0, borderTopWidth: BORDER,    borderRightWidth: BORDER, borderTopRightRadius: 4 },
  bl: { bottom: 0, left: 0,  borderBottomWidth: BORDER, borderLeftWidth: BORDER,  borderBottomLeftRadius: 4 },
  br: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER, borderBottomRightRadius: 4 },

  // ── Text ──────────────────────────────────────────────────────────────────
  hint:        { color: '#c1c2c5', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  successText: { color: '#69db7c', fontSize: 16, fontWeight: '700' },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: '#ff6b6b18',
    borderRadius: 8,
    padding: 12,
  },

  button:     { marginTop: 20, backgroundColor: '#4dabf7', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28 },
  buttonText: { color: '#1a1b1e', fontSize: 15, fontWeight: '700' },

  cancelBtn:  { paddingVertical: 10, paddingHorizontal: 24 },
  cancelText: { color: '#5c5f66', fontSize: 14, textDecorationLine: 'underline' },
});
