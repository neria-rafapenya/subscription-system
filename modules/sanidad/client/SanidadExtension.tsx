// React Native resolves these peer dependencies from apps/client at bundle time.
// @ts-ignore The module is intentionally kept outside the application package.
import { useEffect, useState } from 'react';

type Doctor = { id: string; name: string; specialty: string };
type Appointment = { id: string; scheduled_at: string; doctor_name: string; specialty: string; modality: string; status: string };
type DocumentItem = { id: string; title: string; filename: string; category: string; url: string; created_at: string };
type Report = { id: string; title: string; report_type: string; content: string; issued_at: string; doctor_name?: string };
type Message = { id: string; subject: string; body: string; sender_type: string; created_at: string };

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

export default function SanidadExtension({ accessToken, ui }: { accessToken: string | null; ui: Record<string, any> }) {
  const { Text, TextInput, TouchableOpacity, View } = ui;
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [modality, setModality] = useState('presencial');
  const [scheduledAt, setScheduledAt] = useState('');
  const [reason, setReason] = useState('');
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatBody, setChatBody] = useState('');
  const [chatAnswer, setChatAnswer] = useState('');
  const [notice, setNotice] = useState('');

  const inform = (title: string, message: string) => setNotice(`${title}: ${message}`);

  const openDocument = (url: string) => {
    if (typeof window !== 'undefined') window.open(`${API_URL}${url}`, '_blank', 'noopener,noreferrer');
    else inform('Documento', 'La apertura nativa de documentos se conectará con el visor del dispositivo en la siguiente iteración.');
  };

  const request = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : `API error ${response.status}`);
    return body as T;
  };

  const load = async () => {
    try {
      const [doctorData, appointmentData, documentData, reportData, messageData] = await Promise.all([
        request<Doctor[]>('/modules/sanidad/doctors'),
        request<Appointment[]>('/modules/sanidad/appointments/me'),
        request<DocumentItem[]>('/modules/sanidad/documents/me'),
        request<Report[]>('/modules/sanidad/reports/me'),
        request<Message[]>('/modules/sanidad/messages/me'),
      ]);
      setDoctors(doctorData);
      setAppointments(appointmentData);
      setDocuments(documentData);
      setReports(reportData);
      setMessages(messageData);
      if (!selectedDoctor && doctorData.length) setSelectedDoctor(doctorData[0].id);
      setNotice('');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Activa una suscripción de Sanidad para utilizar este módulo.');
    }
  };

  useEffect(() => { if (accessToken) void load(); }, [accessToken]);

  const createAppointment = async () => {
    if (!selectedDoctor || !scheduledAt || !reason.trim()) return inform('Faltan datos', 'Selecciona médico, fecha y motivo.');
    try {
      await request('/modules/sanidad/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctor_id: selectedDoctor, modality, scheduled_at: scheduledAt, reason }) });
      setScheduledAt(''); setReason(''); setNotice('Cita solicitada. Se han programado sus recordatorios.'); await load();
    } catch (cause) { inform('No se pudo solicitar la cita', cause instanceof Error ? cause.message : 'Inténtalo de nuevo.'); }
  };

  const uploadDocument = () => {
    if (typeof window === 'undefined') return inform('Subida de documentos', 'La selección nativa de archivos se conectará con el selector del dispositivo en la siguiente iteración.');
    const input = (globalThis as typeof globalThis & { document?: { createElement: (tag: string) => HTMLInputElement } }).document?.createElement('input');
    if (!input) return;
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const form = new FormData();
      form.append('title', file.name);
      form.append('category', 'general');
      form.append('document', file);
      try { await request('/modules/sanidad/documents', { method: 'POST', body: form }); setNotice('Documento subido correctamente.'); await load(); }
      catch (cause) { inform('No se pudo subir el documento', cause instanceof Error ? cause.message : 'Inténtalo de nuevo.'); }
    };
    input.click();
  };

  const sendMessage = async () => {
    if (!messageSubject.trim() || !messageBody.trim()) return;
    try { await request('/modules/sanidad/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: messageSubject, body: messageBody }) }); setMessageSubject(''); setMessageBody(''); setNotice('Mensaje enviado.'); await load(); }
    catch (cause) { inform('No se pudo enviar el mensaje', cause instanceof Error ? cause.message : 'Inténtalo de nuevo.'); }
  };

  const startChat = async () => {
    try { const session = await request<{ id: string }>('/modules/sanidad/chat/sessions', { method: 'POST' }); setChatSessionId(session.id); setChatAnswer('Conversación iniciada en modo demostración.'); }
    catch (cause) { inform('Chatbot no disponible', cause instanceof Error ? cause.message : 'La función requiere Premium.'); }
  };

  const sendChat = async () => {
    if (!chatSessionId || !chatBody.trim()) return;
    try { const result = await request<{ answer: string }>(`/modules/sanidad/chat/sessions/${chatSessionId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: chatBody }) }); setChatBody(''); setChatAnswer(result.answer); }
    catch (cause) { inform('No se pudo enviar la consulta', cause instanceof Error ? cause.message : 'Inténtalo de nuevo.'); }
  };

  return <View style={styles.container}>
    <Text style={styles.title}>Módulo Sanidad</Text>
    <Text style={styles.subtitle}>Citas, documentos, informes y comunicación sanitaria.</Text>
    {notice ? <Text style={styles.notice}>{notice}</Text> : null}

    <View style={styles.card}><Text style={styles.cardTitle}>Citas y visitas</Text>
      <Text style={styles.label}>Médico</Text>
      <View style={styles.chips}>{doctors.map((doctor: Doctor) => <TouchableOpacity key={doctor.id} style={[styles.chip, selectedDoctor === doctor.id ? styles.chipSelected : null]} onPress={() => setSelectedDoctor(doctor.id)}><Text style={styles.chipText}>{doctor.name} · {doctor.specialty}</Text></TouchableOpacity>)}</View>
      <TextInput style={styles.input} value={scheduledAt} onChangeText={setScheduledAt} placeholder="Fecha ISO, por ejemplo 2026-12-01T10:00" />
      <View style={styles.chips}>{['presencial', 'videollamada', 'telefonica'].map((value) => <TouchableOpacity key={value} style={[styles.chip, modality === value ? styles.chipSelected : null]} onPress={() => setModality(value)}><Text style={styles.chipText}>{value}</Text></TouchableOpacity>)}</View>
      <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Motivo de la consulta" />
      <TouchableOpacity style={styles.button} onPress={() => void createAppointment()}><Text style={styles.buttonText}>Solicitar cita</Text></TouchableOpacity>
      {appointments.map((item: Appointment) => <Text key={item.id} style={styles.item}>{new Date(item.scheduled_at).toLocaleString('es-ES')} · {item.doctor_name} · {item.modality} · {item.status}</Text>)}
    </View>

    <View style={styles.card}><Text style={styles.cardTitle}>Documentos</Text><TouchableOpacity style={styles.button} onPress={uploadDocument}><Text style={styles.buttonText}>Subir documento</Text></TouchableOpacity>{documents.map((item: DocumentItem) => <TouchableOpacity key={item.id} onPress={() => openDocument(item.url)}><Text style={styles.link}>{item.title} · {item.filename}</Text></TouchableOpacity>)}</View>

    <View style={styles.card}><Text style={styles.cardTitle}>Diagnósticos e informes</Text>{reports.length ? reports.map((item: Report) => <View key={item.id} style={styles.itemBox}><Text style={styles.item}><Text style={styles.bold}>{item.title}</Text> · {item.report_type}</Text><Text style={styles.item}>{item.content}</Text></View>) : <Text style={styles.item}>No hay informes disponibles.</Text>}</View>

    <View style={styles.card}><Text style={styles.cardTitle}>Mensajes</Text><TextInput style={styles.input} value={messageSubject} onChangeText={setMessageSubject} placeholder="Asunto" /><TextInput style={[styles.input, styles.multiline]} value={messageBody} onChangeText={setMessageBody} placeholder="Mensaje para el centro" multiline /><TouchableOpacity style={styles.button} onPress={() => void sendMessage()}><Text style={styles.buttonText}>Enviar mensaje</Text></TouchableOpacity>{messages.slice(0, 5).map((item: Message) => <Text key={item.id} style={styles.item}><Text style={styles.bold}>{item.subject}</Text> · {item.body}</Text>)}</View>

    <View style={styles.card}><Text style={styles.cardTitle}>Asistente sanitario</Text><Text style={styles.item}>Disponible como demostración Premium. No realiza diagnósticos.</Text><TouchableOpacity style={styles.button} onPress={() => void startChat()}><Text style={styles.buttonText}>Iniciar chatbot</Text></TouchableOpacity>{chatSessionId ? <><TextInput style={styles.input} value={chatBody} onChangeText={setChatBody} placeholder="Escribe una consulta" /><TouchableOpacity style={styles.button} onPress={() => void sendChat()}><Text style={styles.buttonText}>Enviar consulta</Text></TouchableOpacity><Text style={styles.item}>{chatAnswer}</Text></> : null}</View>
  </View>;
}

const styles = {
  container: { marginBottom: 18 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  subtitle: { color: '#64748b', marginBottom: 10 },
  card: { backgroundColor: '#fff', borderColor: '#dbe4f0', borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800', marginBottom: 8 },
  label: { color: '#475569', fontSize: 13, fontWeight: '700', marginBottom: 5 },
  input: { borderColor: '#cbd5e1', borderRadius: 8, borderWidth: 1, color: '#0f172a', marginBottom: 8, padding: 10 },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { borderColor: '#93c5fd', borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  chipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  chipText: { color: '#1e40af', fontSize: 12 },
  button: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 8, marginBottom: 8, padding: 10 },
  buttonText: { color: '#fff', fontWeight: '800' },
  item: { color: '#475569', fontSize: 13, marginTop: 6 },
  itemBox: { borderTopColor: '#e2e8f0', borderTopWidth: 1, marginTop: 8, paddingTop: 8 },
  bold: { fontWeight: '800' },
  link: { color: '#1d4ed8', fontSize: 13, marginTop: 7 },
  notice: { backgroundColor: '#eff6ff', borderRadius: 8, color: '#1e40af', marginBottom: 10, padding: 10 },
};
