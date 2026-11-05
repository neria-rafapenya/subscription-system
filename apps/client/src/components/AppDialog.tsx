import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type AppDialogState = {
  title: string;
  message: string;
  kind?: 'info' | 'success' | 'warning' | 'error';
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void | Promise<void>;
};

type AppDialogProps = {
  dialog: AppDialogState | null;
  onClose: () => void;
};

export function AppDialog({ dialog, onClose }: AppDialogProps) {
  const [busy, setBusy] = useState(false);
  const isConfirm = Boolean(dialog?.onConfirm);

  if (!dialog) return null;

  const confirm = async () => {
    if (!dialog.onConfirm) return onClose();
    setBusy(true);
    try {
      await dialog.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={[styles.icon, dialog.kind === 'error' ? styles.errorIcon : dialog.kind === 'warning' ? styles.warningIcon : dialog.kind === 'success' ? styles.successIcon : styles.infoIcon]}>
            <Text style={styles.iconText}>{dialog.kind === 'error' ? '!' : dialog.kind === 'warning' ? '?' : dialog.kind === 'success' ? '✓' : 'i'}</Text>
          </View>
          <Text style={styles.title}>{dialog.title}</Text>
          <Text style={styles.message}>{dialog.message}</Text>
          <View style={styles.actions}>
            {isConfirm ? <Pressable disabled={busy} style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelText}>{dialog.cancelLabel ?? 'Cancelar'}</Text></Pressable> : null}
            <Pressable disabled={busy} style={styles.confirmButton} onPress={() => void confirm()}><Text style={styles.confirmText}>{busy ? 'Procesando…' : dialog.confirmLabel ?? 'Aceptar'}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, .48)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 18, padding: 24, alignItems: 'center', gap: 12, shadowColor: '#0f172a', shadowOpacity: .2, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  icon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  infoIcon: { backgroundColor: '#dbeafe' },
  successIcon: { backgroundColor: '#dcfce7' },
  warningIcon: { backgroundColor: '#fef3c7' },
  errorIcon: { backgroundColor: '#fee2e2' },
  iconText: { fontSize: 25, fontWeight: '800', color: '#1d4ed8' },
  title: { color: '#0f172a', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  message: { color: '#475569', fontSize: 15, lineHeight: 21, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelButton: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, paddingVertical: 10, paddingHorizontal: 15 },
  cancelText: { color: '#475569', fontWeight: '700' },
  confirmButton: { backgroundColor: '#1d4ed8', borderRadius: 9, paddingVertical: 10, paddingHorizontal: 15 },
  confirmText: { color: '#fff', fontWeight: '700' },
});
