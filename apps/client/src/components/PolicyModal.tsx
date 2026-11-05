import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type PolicyModalProps = {
  visible: boolean;
  onClose: () => void;
  onAccept: () => void;
};

export function PolicyModal({ visible, onClose, onAccept }: PolicyModalProps) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Políticas y condiciones de suscripción</Text>
          <Text style={styles.version}>Versión v1 · Resumen informativo</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <Text style={styles.heading}>Datos de facturación</Text>
            <Text style={styles.text}>La dirección y el DNI/NIE se guardan en tu perfil para gestionar la facturación y la relación contractual del servicio.</Text>

            <Text style={styles.heading}>Suscripción recurrente</Text>
            <Text style={styles.text}>La suscripción se renueva automáticamente al finalizar cada periodo mientras el precio contratado no haya cambiado y la renovación siga activa.</Text>

            <Text style={styles.heading}>Cancelación</Text>
            <Text style={styles.text}>Puedes solicitar que no se renueve desde la aplicación. La cancelación no elimina inmediatamente el acceso: la suscripción permanece vigente hasta el final del periodo contratado.</Text>

            <Text style={styles.heading}>Cambios de precio</Text>
            <Text style={styles.text}>Si cambia el precio del plan, se te notificará. La renovación automática quedará pausada hasta que aceptes el nuevo precio o dejes que termine el periodo vigente.</Text>

            <Text style={styles.heading}>Pago y protección de datos</Text>
            <Text style={styles.text}>El pago se tramitará mediante la pasarela configurada para el servicio. Esta pantalla no solicita datos de tarjeta. El tratamiento de datos deberá completarse con la información legal y las garantías de privacidad aplicables al entorno final.</Text>
          </ScrollView>
          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelText}>Volver</Text></Pressable>
            <Pressable style={styles.acceptButton} onPress={onAccept}><Text style={styles.acceptText}>Acepto estas políticas</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, .52)', justifyContent: 'center', padding: 18 },
  modal: { maxHeight: '88%', backgroundColor: '#fff', borderRadius: 18, padding: 22, gap: 10 },
  title: { color: '#0f172a', fontSize: 21, fontWeight: '800' },
  version: { color: '#64748b', fontSize: 12 },
  scroll: { flexGrow: 0 },
  content: { gap: 8, paddingVertical: 8 },
  heading: { color: '#0f172a', fontSize: 15, fontWeight: '800', marginTop: 6 },
  text: { color: '#475569', fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' },
  cancelButton: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, paddingVertical: 11, paddingHorizontal: 14 },
  cancelText: { color: '#475569', fontWeight: '700' },
  acceptButton: { backgroundColor: '#1d4ed8', borderRadius: 9, paddingVertical: 11, paddingHorizontal: 14 },
  acceptText: { color: '#fff', fontWeight: '700' },
});
