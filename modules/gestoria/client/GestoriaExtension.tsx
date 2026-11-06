// React Native resolves these peer dependencies from apps/client at bundle time.
// @ts-ignore The module is intentionally kept outside the application package.
import { useEffect, useState } from 'react';
// @ts-ignore The module dependency is installed in apps/client for the shared extension.
import * as DocumentPicker from 'expo-document-picker';

type Advisor = { id: string; name: string; specialty: string };
type AvailabilitySlot = { scheduled_at: string; advisor_id: string; provider: string };
type Appointment = { id: string; scheduled_at: string; advisor_id: string; advisor_name: string; specialty: string; modality: string; status: string; reason: string };
type DocumentItem = { id: string; title: string; filename: string; category: string; size_bytes: number; url: string; created_at: string };
type Message = { id: string; subject: string; body: string; sender_type: string; message_type: string; reply_to_id?: string | null; read_at?: string | null; created_at: string };
type Notification = { id: string; title: string; body: string; type: string; status: string; read_at?: string | null; scheduled_for: string };
type ModuleStatus = { tier: 'basic' | 'premium'; max_document_size: number; document_limit_label: string; scheduler_provider: string; erp_provider: string };
type Procedure = { id: string; title: string; procedure_type: string; status: string; progress: number; result?: string | null; erp_sync_status?: string; erp_provider?: string };
type LaborRequest = { id: string; request_type: string; subject: string; description: string; status: string; erp_sync_status?: string; erp_provider?: string };

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';
const formatDate = (value: string) => new Date(value).toLocaleString('es-ES');
const sizeInMb = (value: number) => `${(value / (1024 * 1024)).toFixed(value % (1024 * 1024) ? 1 : 0)} MB`;

const numberValue = (value: string) => Number(value.replace(',', '.')) || 0;

function FreeTools({ ui, selectedTool }: { ui: Record<string, any>; selectedTool?: string }) {
  const { Text, TextInput, TouchableOpacity, View } = ui;
  const [grossAnnual, setGrossAnnual] = useState('30000');
  const [payments, setPayments] = useState('12');
  const [socialRate, setSocialRate] = useState('6.35');
  const [incomeTaxRate, setIncomeTaxRate] = useState('15');
  const [netResult, setNetResult] = useState('');
  const [autonomoBase, setAutonomoBase] = useState('1500');
  const [autonomoRate, setAutonomoRate] = useState('31.6');
  const [autonomoResult, setAutonomoResult] = useState('');
  const [quarterlyIncome, setQuarterlyIncome] = useState('6000');
  const [quarterlyExpenses, setQuarterlyExpenses] = useState('1500');
  const [quarterlyTaxRate, setQuarterlyTaxRate] = useState('15');
  const [quarterlyResult, setQuarterlyResult] = useState('');
  const [calendarYear, setCalendarYear] = useState(String(new Date().getFullYear()));

  const calculateNet = () => {
    const monthlyGross = numberValue(grossAnnual) / Math.max(1, numberValue(payments));
    const social = monthlyGross * numberValue(socialRate) / 100;
    const tax = monthlyGross * numberValue(incomeTaxRate) / 100;
    setNetResult(`Estimación: ${(monthlyGross - social - tax).toFixed(2)} € netos/mes · bruto mensual ${(monthlyGross).toFixed(2)} €`);
  };

  const calculateAutonomo = () => {
    const fee = numberValue(autonomoBase) * numberValue(autonomoRate) / 100;
    setAutonomoResult(`Cuota estimada: ${fee.toFixed(2)} €/mes`);
  };

  const calculateQuarterly = () => {
    const iva = (numberValue(quarterlyIncome) - numberValue(quarterlyExpenses)) * 0.21;
    const irpf = numberValue(quarterlyIncome) * numberValue(quarterlyTaxRate) / 100;
    setQuarterlyResult(`Estimación conjunta: ${(iva - irpf).toFixed(2)} € · IVA neto ${(iva).toFixed(2)} € · IRPF ${(irpf).toFixed(2)} €`);
  };

  const fiscalDates = [
    `20/04/${calendarYear} · Primer trimestre · IVA / IRPF`,
    `20/07/${calendarYear} · Segundo trimestre · IVA / IRPF`,
    `20/10/${calendarYear} · Tercer trimestre · IVA / IRPF`,
    `30/01/${calendarYear} · Resúmenes anuales y cuarto trimestre`,
  ];
  const showTool = (toolId: string) => !selectedTool || selectedTool === toolId;

  return <View style={freeStyles.wrapper}>
    <Text style={freeStyles.eyebrow}>CAPTACIÓN · SIN SUSCRIPCIÓN</Text>
    <Text style={freeStyles.title}>Herramientas gratuitas</Text>
    <Text style={freeStyles.subtitle}>Simulaciones orientativas para autónomos y empresas. Después puedes contactar con la gestoría para revisar tu caso.</Text>
    {showTool('salary') ? <View style={freeStyles.card}><Text style={freeStyles.cardTitle}>Calculadora sueldo neto</Text><TextInput style={freeStyles.input} keyboardType="decimal-pad" value={grossAnnual} onChangeText={setGrossAnnual} placeholder="Bruto anual" /><TextInput style={freeStyles.input} keyboardType="number-pad" value={payments} onChangeText={setPayments} placeholder="Número de pagas" /><View style={freeStyles.row}><TextInput style={freeStyles.halfInput} keyboardType="decimal-pad" value={socialRate} onChangeText={setSocialRate} placeholder="SS %" /><TextInput style={freeStyles.halfInput} keyboardType="decimal-pad" value={incomeTaxRate} onChangeText={setIncomeTaxRate} placeholder="IRPF %" /></View><TouchableOpacity style={freeStyles.button} onPress={calculateNet}><Text style={freeStyles.buttonText}>Calcular sueldo neto</Text></TouchableOpacity>{netResult ? <Text style={freeStyles.result}>{netResult}</Text> : null}</View> : null}
    {showTool('autonomos') ? <View style={freeStyles.card}><Text style={freeStyles.cardTitle}>Calculadora cuota autónomos</Text><TextInput style={freeStyles.input} keyboardType="decimal-pad" value={autonomoBase} onChangeText={setAutonomoBase} placeholder="Base o rendimiento mensual" /><TextInput style={freeStyles.input} keyboardType="decimal-pad" value={autonomoRate} onChangeText={setAutonomoRate} placeholder="Tipo estimado %" /><TouchableOpacity style={freeStyles.button} onPress={calculateAutonomo}><Text style={freeStyles.buttonText}>Calcular cuota</Text></TouchableOpacity>{autonomoResult ? <Text style={freeStyles.result}>{autonomoResult}</Text> : null}</View> : null}
    {showTool('iva-irpf') ? <View style={freeStyles.card}><Text style={freeStyles.cardTitle}>Simulador IVA / IRPF trimestral</Text><TextInput style={freeStyles.input} keyboardType="decimal-pad" value={quarterlyIncome} onChangeText={setQuarterlyIncome} placeholder="Ingresos del trimestre" /><TextInput style={freeStyles.input} keyboardType="decimal-pad" value={quarterlyExpenses} onChangeText={setQuarterlyExpenses} placeholder="Gastos del trimestre" /><TextInput style={freeStyles.input} keyboardType="decimal-pad" value={quarterlyTaxRate} onChangeText={setQuarterlyTaxRate} placeholder="Retención IRPF %" /><TouchableOpacity style={freeStyles.button} onPress={calculateQuarterly}><Text style={freeStyles.buttonText}>Simular trimestre</Text></TouchableOpacity>{quarterlyResult ? <Text style={freeStyles.result}>{quarterlyResult}</Text> : null}</View> : null}
    {showTool('calendario') ? <View style={freeStyles.card}><Text style={freeStyles.cardTitle}>Calendario fiscal del año</Text><TextInput style={freeStyles.input} keyboardType="number-pad" value={calendarYear} onChangeText={setCalendarYear} placeholder="Año" />{fiscalDates.map((item) => <Text key={item} style={freeStyles.calendarItem}>{item}</Text>)}<Text style={freeStyles.disclaimer}>Fechas orientativas: deben contrastarse con el calendario oficial y la situación fiscal aplicable.</Text></View> : null}
  </View>;
}

const freeStyles = {
  wrapper: { marginBottom: 18, gap: 10 },
  eyebrow: { color: '#0f766e', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#0f172a', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#475569', fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: '#ecfeff', borderColor: '#99f6e4', borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  cardTitle: { color: '#134e4a', fontSize: 16, fontWeight: '800' },
  input: { backgroundColor: '#fff', borderColor: '#a5f3fc', borderRadius: 8, borderWidth: 1, color: '#0f172a', padding: 10 },
  row: { flexDirection: 'row', gap: 8 },
  halfInput: { backgroundColor: '#fff', borderColor: '#a5f3fc', borderRadius: 8, borderWidth: 1, color: '#0f172a', flex: 1, padding: 10 },
  button: { alignItems: 'center', backgroundColor: '#0f766e', borderRadius: 8, padding: 10 },
  buttonText: { color: '#fff', fontWeight: '800' },
  result: { color: '#115e59', fontSize: 13, fontWeight: '700' },
  calendarItem: { backgroundColor: '#fff', borderRadius: 8, color: '#134e4a', padding: 9 },
  disclaimer: { color: '#64748b', fontSize: 11, lineHeight: 16 },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, .42)' },
  sheetBackdrop: { flex: 1 },
  sheet: { maxHeight: '88%', backgroundColor: '#f8fafc', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, shadowColor: '#0f172a', shadowOpacity: .25, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 12, gap: 10 },
  sheetHeaderCopy: { flex: 1, gap: 2 },
  sheetTitle: { color: '#0f172a', fontSize: 20, fontWeight: '800' },
  sheetHint: { color: '#64748b', fontSize: 12 },
  closeButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e2e8f0' },
  closeButtonText: { color: '#475569', fontSize: 26, lineHeight: 28 },
  sheetScroll: { paddingHorizontal: 18, paddingBottom: 28 },
};

export default function GestoriaExtension({ accessToken, ui, activeSection, showFreeTools = false, selectedFreeTool, onCloseFreeTools }: { accessToken: string | null; ui: Record<string, any>; activeSection?: string; showFreeTools?: boolean; selectedFreeTool?: string; onCloseFreeTools?: () => void }) {
  const { Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } = ui;
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [laborRequests, setLaborRequests] = useState<LaborRequest[]>([]);
  const [moduleStatus, setModuleStatus] = useState<ModuleStatus | null>(null);
  const [selectedAdvisor, setSelectedAdvisor] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [modality, setModality] = useState('presencial');
  const [reason, setReason] = useState('');
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageType, setMessageType] = useState('normal');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [laborType, setLaborType] = useState('vacaciones');
  const [laborSubject, setLaborSubject] = useState('');
  const [laborDescription, setLaborDescription] = useState('');
  const [laborStart, setLaborStart] = useState('');
  const [laborEnd, setLaborEnd] = useState('');
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
    const response = await fetch(`${API_URL}${path}`, { ...init, headers: { ...(init.headers || {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : `API error ${response.status}`);
    return body as T;
  };

  const load = async () => {
    try {
      const [statusData, advisorData, availabilityData, appointmentData, documentData, procedureData, laborData, messageData, notificationData] = await Promise.all([
        request<ModuleStatus>('/modules/gestoria/module-status'),
        request<Advisor[]>('/modules/gestoria/advisors'),
        request<{ slots: AvailabilitySlot[] }>('/modules/gestoria/availability'),
        request<Appointment[]>('/modules/gestoria/appointments/me'),
        request<DocumentItem[]>('/modules/gestoria/documents/me'),
        request<Procedure[]>('/modules/gestoria/procedures/me'),
        request<LaborRequest[]>('/modules/gestoria/labor/requests/me').catch(() => []),
        request<Message[]>('/modules/gestoria/messages/me'),
        request<Notification[]>('/modules/gestoria/notifications/me'),
      ]);
      setModuleStatus(statusData); setAdvisors(advisorData); setAvailability(availabilityData.slots); setAppointments(appointmentData); setDocuments(documentData); setProcedures(procedureData); setLaborRequests(laborData); setMessages(messageData); setNotifications(notificationData);
      if (!selectedAdvisor && advisorData.length) setSelectedAdvisor(advisorData[0].id);
      setNotice('');
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Activa una suscripción de Gestoría para utilizar este módulo.'); }
  };
  useEffect(() => { if (accessToken) void load(); }, [accessToken]);

  const slotsForAdvisor = availability.filter((slot: AvailabilitySlot) => !selectedAdvisor || slot.advisor_id === selectedAdvisor);
  const createOrUpdateAppointment = async () => {
    if (!selectedAdvisor || !selectedSlot || !reason.trim()) return inform('Faltan datos', 'Selecciona gestor, horario y motivo.');
    try {
      const body = JSON.stringify({ advisor_id: selectedAdvisor, modality, scheduled_at: selectedSlot, reason });
      if (editingAppointmentId) { await request(`/modules/gestoria/appointments/${editingAppointmentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }); setNotice('Cita modificada correctamente.'); }
      else { await request('/modules/gestoria/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); setNotice('Cita solicitada. Se han programado sus recordatorios.'); }
      setSelectedSlot(''); setReason(''); setEditingAppointmentId(null); await load();
    } catch (cause) { inform(editingAppointmentId ? 'No se pudo modificar la cita' : 'No se pudo solicitar la cita', cause instanceof Error ? cause.message : 'Inténtalo de nuevo.'); }
  };
  const editAppointment = (appointment: Appointment) => { setEditingAppointmentId(appointment.id); setSelectedAdvisor(appointment.advisor_id); setSelectedSlot(appointment.scheduled_at); setModality(appointment.modality); setReason(appointment.reason); };
  const cancelAppointment = async (appointmentId: string) => {
    try { await request(`/modules/gestoria/appointments/${appointmentId}/cancel`, { method: 'POST' }); setNotice('Cita cancelada.'); await load(); }
    catch (cause) { inform('No se pudo cancelar la cita', cause instanceof Error ? cause.message : 'Inténtalo de nuevo.'); }
  };

  const sendDocument = async (file: { uri: string; name: string; size?: number; mimeType?: string; webFile?: Blob }) => {
    if (!moduleStatus) return inform('Documentos', 'Todavía estamos cargando los límites de tu suscripción.');
    if (typeof file.size === 'number' && file.size > moduleStatus.max_document_size) return inform('Documento demasiado grande', `Tu plan permite hasta ${moduleStatus.document_limit_label} por documento.`);
    const form = new FormData(); form.append('title', file.name); form.append('category', 'general');
    form.append('document', file.webFile ?? ({ uri: file.uri, name: file.name, type: file.mimeType ?? 'application/octet-stream' } as unknown as Blob));
    try { await request('/modules/gestoria/documents', { method: 'POST', body: form }); setNotice(`Documento subido${file.size ? ` (${sizeInMb(file.size)})` : ''}.`); await load(); }
    catch (cause) { inform('No se pudo subir el documento', cause instanceof Error ? cause.message : 'Inténtalo de nuevo.'); }
  };

  const uploadDocument = async () => {
    if (!moduleStatus) return inform('Documentos', 'Todavía estamos cargando los límites de tu suscripción.');
    if (typeof window === 'undefined') {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      return sendDocument({ uri: asset.uri, name: asset.name, size: asset.size, mimeType: asset.mimeType });
    }
    const input = (globalThis as typeof globalThis & { document?: { createElement: (tag: string) => HTMLInputElement } }).document?.createElement('input');
    if (!input) return;
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      await sendDocument({ uri: '', name: file.name, size: file.size, mimeType: file.type, webFile: file });
    };
    input.click();
  };

  const sendMessage = async () => {
    if (!messageSubject.trim() || !messageBody.trim()) return inform('Faltan datos', 'Indica asunto y mensaje.');
    try { await request('/modules/gestoria/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: messageSubject, body: messageBody, message_type: messageType }) }); setMessageSubject(''); setMessageBody(''); setNotice('Mensaje enviado.'); await load(); }
    catch (cause) { inform('No se pudo enviar el mensaje', cause instanceof Error ? cause.message : 'Inténtalo de nuevo.'); }
  };
  const markMessageRead = async (messageId: string) => {
    try { await request(`/modules/gestoria/messages/${messageId}/read`, { method: 'PATCH' }); await load(); }
    catch (cause) { inform('No se pudo actualizar el mensaje', cause instanceof Error ? cause.message : 'Inténtalo de nuevo.'); }
  };
  const replyMessage = async () => {
    if (!replyTo || !replyBody.trim()) return;
    try { await request(`/modules/gestoria/messages/${replyTo}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: replyBody }) }); setReplyTo(null); setReplyBody(''); setNotice('Respuesta enviada.'); await load(); }
    catch (cause) { inform('No se pudo enviar la respuesta', cause instanceof Error ? cause.message : 'Inténtalo de nuevo.'); }
  };
  const markNotificationRead = async (notificationId: string) => {
    try { await request(`/modules/gestoria/notifications/${notificationId}/read`, { method: 'PATCH' }); await load(); }
    catch (cause) { inform('No se pudo actualizar la notificación', cause instanceof Error ? cause.message : 'Inténtalo de nuevo.'); }
  };
  const sendLaborRequest = async () => {
    if (!laborSubject.trim() || !laborDescription.trim()) return inform('Faltan datos', 'Indica asunto y descripción de la solicitud laboral.');
    try {
      await request('/modules/gestoria/labor/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_type: laborType, subject: laborSubject, description: laborDescription, period_start: laborStart || null, period_end: laborEnd || null }) });
      setLaborSubject(''); setLaborDescription(''); setLaborStart(''); setLaborEnd(''); setNotice('Solicitud laboral enviada y preparada para sincronizar con el ERP.'); await load();
    } catch (cause) { inform('No se pudo enviar la solicitud laboral', cause instanceof Error ? cause.message : 'La función requiere Premium.'); }
  };
  const startChat = async () => {
    try { const session = await request<{ id: string }>('/modules/gestoria/chat/sessions', { method: 'POST' }); setChatSessionId(session.id); setChatAnswer('Conversación iniciada en modo demostración.'); }
    catch (cause) { inform('Chatbot no disponible', cause instanceof Error ? cause.message : 'La función requiere Premium.'); }
  };
  const sendChat = async () => {
    if (!chatSessionId || !chatBody.trim()) return;
    try { const result = await request<{ answer: string }>(`/modules/gestoria/chat/sessions/${chatSessionId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: chatBody }) }); setChatBody(''); setChatAnswer(result.answer); }
    catch (cause) { inform('No se pudo enviar la consulta', cause instanceof Error ? cause.message : 'Inténtalo de nuevo.'); }
  };

  const freeToolsModal = <Modal transparent visible={showFreeTools} animationType="slide" onRequestClose={onCloseFreeTools}>
    <View style={freeStyles.sheetOverlay}>
      <Pressable style={freeStyles.sheetBackdrop} onPress={onCloseFreeTools} />
      <View style={freeStyles.sheet}>
        <View style={freeStyles.sheetHeader}>
          <View style={freeStyles.sheetHeaderCopy}><Text style={freeStyles.sheetTitle}>{selectedFreeTool === 'salary' ? 'Calculadora sueldo neto' : selectedFreeTool === 'autonomos' ? 'Calculadora cuota autónomos' : selectedFreeTool === 'iva-irpf' ? 'Simulador IVA / IRPF' : selectedFreeTool === 'calendario' ? 'Calendario fiscal' : 'Herramientas gratuitas'}</Text><Text style={freeStyles.sheetHint}>Orientativa y disponible sin suscripción.</Text></View>
          <TouchableOpacity accessibilityLabel="Cerrar herramientas gratuitas" style={freeStyles.closeButton} onPress={onCloseFreeTools}><Text style={freeStyles.closeButtonText}>×</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={freeStyles.sheetScroll}><FreeTools ui={ui} selectedTool={selectedFreeTool} /></ScrollView>
      </View>
    </View>
  </Modal>;

  const renderActiveSection = () => {
    if (activeSection === 'appointments') return <View style={styles.card}><Text style={styles.cardTitle}>Citas y visitas</Text><Text style={styles.label}>Gestor</Text><View style={styles.chips}>{advisors.map((advisor: Advisor) => <TouchableOpacity key={advisor.id} style={[styles.chip, selectedAdvisor === advisor.id ? styles.chipSelected : null]} onPress={() => { setSelectedAdvisor(advisor.id); setSelectedSlot(''); }}><Text style={styles.chipText}>{advisor.name} · {advisor.specialty}</Text></TouchableOpacity>)}</View><Text style={styles.label}>Horario disponible</Text><View style={styles.chips}>{slotsForAdvisor.slice(0, 24).map((slot: AvailabilitySlot) => <TouchableOpacity key={`${slot.advisor_id}-${slot.scheduled_at}`} style={[styles.chip, selectedSlot === slot.scheduled_at ? styles.chipSelected : null]} onPress={() => setSelectedSlot(slot.scheduled_at)}><Text style={styles.chipText}>{formatDate(slot.scheduled_at)}</Text></TouchableOpacity>)}</View>{slotsForAdvisor.length === 0 ? <Text style={styles.item}>No hay horarios disponibles en el intervalo mostrado.</Text> : null}<View style={styles.chips}>{['presencial', 'videollamada', 'telefonica'].map((value) => <TouchableOpacity key={value} style={[styles.chip, modality === value ? styles.chipSelected : null]} onPress={() => setModality(value)}><Text style={styles.chipText}>{value}</Text></TouchableOpacity>)}</View><TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Motivo de la consulta" /><TouchableOpacity style={styles.button} onPress={() => void createOrUpdateAppointment()}><Text style={styles.buttonText}>{editingAppointmentId ? 'Guardar cambios' : 'Solicitar cita'}</Text></TouchableOpacity>{editingAppointmentId ? <TouchableOpacity style={styles.secondaryButton} onPress={() => { setEditingAppointmentId(null); setSelectedSlot(''); setReason(''); }}><Text style={styles.secondaryButtonText}>Cancelar modificación</Text></TouchableOpacity> : null}{appointments.map((item: Appointment) => <View key={item.id} style={styles.itemBox}><Text style={styles.item}><Text style={styles.bold}>{formatDate(item.scheduled_at)}</Text> · {item.advisor_name} · {item.modality} · {item.status}</Text><Text style={styles.item}>{item.reason}</Text>{!['cancelled', 'completed'].includes(item.status) ? <View style={styles.actionRow}><TouchableOpacity style={styles.smallButton} onPress={() => editAppointment(item)}><Text style={styles.buttonText}>Modificar</Text></TouchableOpacity><TouchableOpacity style={styles.smallDangerButton} onPress={() => void cancelAppointment(item.id)}><Text style={styles.buttonText}>Cancelar</Text></TouchableOpacity></View> : null}</View>)}</View>;
    if (activeSection === 'documents') return <View style={styles.card}><Text style={styles.cardTitle}>Documentos</Text><Text style={styles.item}>Límite actual: {moduleStatus?.document_limit_label ?? 'según tu suscripción'} por documento.</Text><TouchableOpacity style={styles.button} onPress={uploadDocument}><Text style={styles.buttonText}>Subir documento</Text></TouchableOpacity>{documents.map((item: DocumentItem) => <TouchableOpacity key={item.id} onPress={() => openDocument(item.url)}><Text style={styles.link}>{item.title} · {item.filename} · {sizeInMb(item.size_bytes)}</Text></TouchableOpacity>)}</View>;
    if (activeSection === 'procedures') return <View style={styles.card}><Text style={styles.cardTitle}>Estado de trámites</Text><Text style={styles.item}>Consulta el progreso y el resultado de los trámites registrados por la gestoría.</Text>{procedures.length ? procedures.map((item: Procedure) => <View key={item.id} style={styles.itemBox}><Text style={styles.item}><Text style={styles.bold}>{item.title}</Text> · {item.procedure_type} · {item.status}</Text><Text style={styles.item}>Progreso: {item.progress}%{item.result ? ` · Resultado: ${item.result}` : ''}</Text><Text style={styles.erpHint}>ERP: {item.erp_sync_status ?? 'pendiente'}{item.erp_provider ? ` · ${item.erp_provider}` : ''}</Text></View>) : <Text style={styles.item}>Todavía no hay trámites registrados.</Text>}</View>;
    if (activeSection === 'labor') return <View style={styles.card}><Text style={styles.cardTitle}>Laboral (incidencias y nóminas)</Text><Text style={styles.item}>Comunica vacaciones, altas, incidencias o consultas de nómina sin llamar por teléfono.</Text><View style={styles.chips}>{['vacaciones', 'alta', 'incidencia', 'nomina'].map((value) => <TouchableOpacity key={value} style={[styles.chip, laborType === value ? styles.chipSelected : null]} onPress={() => setLaborType(value)}><Text style={styles.chipText}>{value}</Text></TouchableOpacity>)}</View><TextInput style={styles.input} value={laborSubject} onChangeText={setLaborSubject} placeholder="Asunto" /><TextInput style={[styles.input, styles.multiline]} value={laborDescription} onChangeText={setLaborDescription} placeholder="Describe la solicitud" multiline /><TextInput style={styles.input} value={laborStart} onChangeText={setLaborStart} placeholder="Fecha inicial (opcional)" /><TextInput style={styles.input} value={laborEnd} onChangeText={setLaborEnd} placeholder="Fecha final (opcional)" /><TouchableOpacity style={styles.button} onPress={() => void sendLaborRequest()}><Text style={styles.buttonText}>Enviar solicitud laboral</Text></TouchableOpacity>{laborRequests.map((item: LaborRequest) => <View key={item.id} style={styles.itemBox}><Text style={styles.item}><Text style={styles.bold}>{item.subject}</Text> · {item.request_type} · {item.status}</Text><Text style={styles.item}>{item.description}</Text><Text style={styles.erpHint}>ERP: {item.erp_sync_status ?? 'pendiente'}{item.erp_provider ? ` · ${item.erp_provider}` : ''}</Text></View>)}</View>;
    if (activeSection === 'messages') return <View style={styles.card}><Text style={styles.cardTitle}>Mensajes</Text><TextInput style={styles.input} value={messageSubject} onChangeText={setMessageSubject} placeholder="Asunto" /><View style={styles.chips}>{['normal', 'urgent', 'informativo'].map((value) => <TouchableOpacity key={value} style={[styles.chip, messageType === value ? styles.chipSelected : null]} onPress={() => setMessageType(value)}><Text style={styles.chipText}>{value}</Text></TouchableOpacity>)}</View><TextInput style={[styles.input, styles.multiline]} value={messageBody} onChangeText={setMessageBody} placeholder="Mensaje para la gestoría" multiline /><TouchableOpacity style={styles.button} onPress={() => void sendMessage()}><Text style={styles.buttonText}>Enviar mensaje</Text></TouchableOpacity>{messages.slice(0, 8).map((item: Message) => <View key={item.id} style={styles.itemBox}><Text style={styles.item}><Text style={styles.bold}>{item.subject}</Text> · {item.message_type} · {item.read_at ? 'leído' : 'no leído'}</Text><Text style={styles.item}>{item.body}</Text><View style={styles.actionRow}>{!item.read_at ? <TouchableOpacity style={styles.smallButton} onPress={() => void markMessageRead(item.id)}><Text style={styles.buttonText}>Marcar leído</Text></TouchableOpacity> : null}<TouchableOpacity style={styles.smallButton} onPress={() => setReplyTo(item.id)}><Text style={styles.buttonText}>Responder</Text></TouchableOpacity></View>{replyTo === item.id ? <><TextInput style={[styles.input, styles.multiline]} value={replyBody} onChangeText={setReplyBody} placeholder="Escribe una respuesta" multiline /><TouchableOpacity style={styles.button} onPress={() => void replyMessage()}><Text style={styles.buttonText}>Enviar respuesta</Text></TouchableOpacity></> : null}</View>)}</View>;
    if (activeSection === 'notifications') return <View style={styles.card}><Text style={styles.cardTitle}>Notificaciones</Text>{notifications.length ? notifications.slice(0, 8).map((item: Notification) => <TouchableOpacity key={item.id} style={styles.itemBox} onPress={() => void markNotificationRead(item.id)}><Text style={styles.item}><Text style={styles.bold}>{item.title}</Text> · {item.type} · {item.read_at ? 'leída' : 'no leída'}</Text><Text style={styles.item}>{item.body} · {item.status} · {formatDate(item.scheduled_for)}</Text></TouchableOpacity>) : <Text style={styles.item}>No hay notificaciones.</Text>}</View>;
    if (activeSection === 'chatbot') return <View style={styles.card}><Text style={styles.cardTitle}>Chatbot IA</Text><Text style={styles.item}>Disponible como demostración Premium. La conexión con el proveedor IA se añadirá más adelante.</Text><TouchableOpacity style={styles.button} onPress={() => void startChat()}><Text style={styles.buttonText}>Iniciar chatbot</Text></TouchableOpacity>{chatSessionId ? <><TextInput style={styles.input} value={chatBody} onChangeText={setChatBody} placeholder="Escribe una consulta" /><TouchableOpacity style={styles.button} onPress={() => void sendChat()}><Text style={styles.buttonText}>Enviar consulta</Text></TouchableOpacity><Text style={styles.item}>{chatAnswer}</Text></> : null}</View>;
    return null;
  };

  if (activeSection) return <View style={styles.container}>
    {freeToolsModal}
    {activeSection !== 'hidden' ? <><Text style={styles.title}>Módulo Gestoría</Text><Text style={styles.subtitle}>Servicios de documentación, citas, mensajería y asistencia.</Text>{moduleStatus ? <Text style={styles.planHint}>Plan {moduleStatus.tier === 'premium' ? 'Premium' : 'Básico'} · documentos de hasta {moduleStatus.document_limit_label} · agenda: {moduleStatus.scheduler_provider} · ERP: {moduleStatus.erp_provider}</Text> : null}{notice ? <Text style={styles.notice}>{notice}</Text> : null}{renderActiveSection()}</> : null}
  </View>;

  return <View style={styles.container}>
    {freeToolsModal}
    <Text style={styles.title}>Módulo Gestoría</Text>
    <Text style={styles.subtitle}>Servicios de documentación, citas, mensajería y asistencia.</Text>
    {moduleStatus ? <Text style={styles.planHint}>Plan {moduleStatus.tier === 'premium' ? 'Premium' : 'Básico'} · documentos de hasta {moduleStatus.document_limit_label} · agenda: {moduleStatus.scheduler_provider} · ERP: {moduleStatus.erp_provider}</Text> : null}
    {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    <View style={styles.card}><Text style={styles.cardTitle}>Citas y visitas</Text><Text style={styles.label}>Gestor</Text><View style={styles.chips}>{advisors.map((advisor: Advisor) => <TouchableOpacity key={advisor.id} style={[styles.chip, selectedAdvisor === advisor.id ? styles.chipSelected : null]} onPress={() => { setSelectedAdvisor(advisor.id); setSelectedSlot(''); }}><Text style={styles.chipText}>{advisor.name} · {advisor.specialty}</Text></TouchableOpacity>)}</View><Text style={styles.label}>Horario disponible</Text><View style={styles.chips}>{slotsForAdvisor.slice(0, 24).map((slot: AvailabilitySlot) => <TouchableOpacity key={`${slot.advisor_id}-${slot.scheduled_at}`} style={[styles.chip, selectedSlot === slot.scheduled_at ? styles.chipSelected : null]} onPress={() => setSelectedSlot(slot.scheduled_at)}><Text style={styles.chipText}>{formatDate(slot.scheduled_at)}</Text></TouchableOpacity>)}</View>{slotsForAdvisor.length === 0 ? <Text style={styles.item}>No hay horarios disponibles en el intervalo mostrado.</Text> : null}<View style={styles.chips}>{['presencial', 'videollamada', 'telefonica'].map((value) => <TouchableOpacity key={value} style={[styles.chip, modality === value ? styles.chipSelected : null]} onPress={() => setModality(value)}><Text style={styles.chipText}>{value}</Text></TouchableOpacity>)}</View><TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Motivo de la consulta" /><TouchableOpacity style={styles.button} onPress={() => void createOrUpdateAppointment()}><Text style={styles.buttonText}>{editingAppointmentId ? 'Guardar cambios' : 'Solicitar cita'}</Text></TouchableOpacity>{editingAppointmentId ? <TouchableOpacity style={styles.secondaryButton} onPress={() => { setEditingAppointmentId(null); setSelectedSlot(''); setReason(''); }}><Text style={styles.secondaryButtonText}>Cancelar modificación</Text></TouchableOpacity> : null}{appointments.map((item: Appointment) => <View key={item.id} style={styles.itemBox}><Text style={styles.item}><Text style={styles.bold}>{formatDate(item.scheduled_at)}</Text> · {item.advisor_name} · {item.modality} · {item.status}</Text><Text style={styles.item}>{item.reason}</Text>{!['cancelled', 'completed'].includes(item.status) ? <View style={styles.actionRow}><TouchableOpacity style={styles.smallButton} onPress={() => editAppointment(item)}><Text style={styles.buttonText}>Modificar</Text></TouchableOpacity><TouchableOpacity style={styles.smallDangerButton} onPress={() => void cancelAppointment(item.id)}><Text style={styles.buttonText}>Cancelar</Text></TouchableOpacity></View> : null}</View>)}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Documentos</Text><Text style={styles.item}>Límite actual: {moduleStatus?.document_limit_label ?? 'según tu suscripción'} por documento.</Text><TouchableOpacity style={styles.button} onPress={uploadDocument}><Text style={styles.buttonText}>Subir documento</Text></TouchableOpacity>{documents.map((item: DocumentItem) => <TouchableOpacity key={item.id} onPress={() => openDocument(item.url)}><Text style={styles.link}>{item.title} · {item.filename} · {sizeInMb(item.size_bytes)}</Text></TouchableOpacity>)}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Estado de trámites</Text><Text style={styles.item}>Consulta el progreso y el resultado de los trámites registrados por la gestoría.</Text>{procedures.length ? procedures.map((item: Procedure) => <View key={item.id} style={styles.itemBox}><Text style={styles.item}><Text style={styles.bold}>{item.title}</Text> · {item.procedure_type} · {item.status}</Text><Text style={styles.item}>Progreso: {item.progress}%{item.result ? ` · Resultado: ${item.result}` : ''}</Text><Text style={styles.erpHint}>ERP: {item.erp_sync_status ?? 'pendiente'}{item.erp_provider ? ` · ${item.erp_provider}` : ''}</Text></View>) : <Text style={styles.item}>Todavía no hay trámites registrados.</Text>}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Laboral (incidencias y nóminas)</Text><Text style={styles.item}>Comunica vacaciones, altas, incidencias o consultas de nómina sin llamar por teléfono.</Text><View style={styles.chips}>{['vacaciones', 'alta', 'incidencia', 'nomina'].map((value) => <TouchableOpacity key={value} style={[styles.chip, laborType === value ? styles.chipSelected : null]} onPress={() => setLaborType(value)}><Text style={styles.chipText}>{value}</Text></TouchableOpacity>)}</View><TextInput style={styles.input} value={laborSubject} onChangeText={setLaborSubject} placeholder="Asunto" /><TextInput style={[styles.input, styles.multiline]} value={laborDescription} onChangeText={setLaborDescription} placeholder="Describe la solicitud" multiline /><TextInput style={styles.input} value={laborStart} onChangeText={setLaborStart} placeholder="Fecha inicial (opcional)" /><TextInput style={styles.input} value={laborEnd} onChangeText={setLaborEnd} placeholder="Fecha final (opcional)" /><TouchableOpacity style={styles.button} onPress={() => void sendLaborRequest()}><Text style={styles.buttonText}>Enviar solicitud laboral</Text></TouchableOpacity>{laborRequests.map((item: LaborRequest) => <View key={item.id} style={styles.itemBox}><Text style={styles.item}><Text style={styles.bold}>{item.subject}</Text> · {item.request_type} · {item.status}</Text><Text style={styles.item}>{item.description}</Text><Text style={styles.erpHint}>ERP: {item.erp_sync_status ?? 'pendiente'}{item.erp_provider ? ` · ${item.erp_provider}` : ''}</Text></View>)}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Mensajes</Text><TextInput style={styles.input} value={messageSubject} onChangeText={setMessageSubject} placeholder="Asunto" /><View style={styles.chips}>{['normal', 'urgent', 'informativo'].map((value) => <TouchableOpacity key={value} style={[styles.chip, messageType === value ? styles.chipSelected : null]} onPress={() => setMessageType(value)}><Text style={styles.chipText}>{value}</Text></TouchableOpacity>)}</View><TextInput style={[styles.input, styles.multiline]} value={messageBody} onChangeText={setMessageBody} placeholder="Mensaje para la gestoría" multiline /><TouchableOpacity style={styles.button} onPress={() => void sendMessage()}><Text style={styles.buttonText}>Enviar mensaje</Text></TouchableOpacity>{messages.slice(0, 8).map((item: Message) => <View key={item.id} style={styles.itemBox}><Text style={styles.item}><Text style={styles.bold}>{item.subject}</Text> · {item.message_type} · {item.read_at ? 'leído' : 'no leído'}</Text><Text style={styles.item}>{item.body}</Text><View style={styles.actionRow}>{!item.read_at ? <TouchableOpacity style={styles.smallButton} onPress={() => void markMessageRead(item.id)}><Text style={styles.buttonText}>Marcar leído</Text></TouchableOpacity> : null}<TouchableOpacity style={styles.smallButton} onPress={() => setReplyTo(item.id)}><Text style={styles.buttonText}>Responder</Text></TouchableOpacity></View>{replyTo === item.id ? <><TextInput style={[styles.input, styles.multiline]} value={replyBody} onChangeText={setReplyBody} placeholder="Escribe una respuesta" multiline /><TouchableOpacity style={styles.button} onPress={() => void replyMessage()}><Text style={styles.buttonText}>Enviar respuesta</Text></TouchableOpacity></> : null}</View>)}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Notificaciones</Text>{notifications.length ? notifications.slice(0, 8).map((item: Notification) => <TouchableOpacity key={item.id} style={styles.itemBox} onPress={() => void markNotificationRead(item.id)}><Text style={styles.item}><Text style={styles.bold}>{item.title}</Text> · {item.type} · {item.read_at ? 'leída' : 'no leída'}</Text><Text style={styles.item}>{item.body} · {item.status} · {formatDate(item.scheduled_for)}</Text></TouchableOpacity>) : <Text style={styles.item}>No hay notificaciones.</Text>}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Chatbot IA</Text><Text style={styles.item}>Disponible como demostración Premium. La conexión con el proveedor IA se añadirá más adelante.</Text><TouchableOpacity style={styles.button} onPress={() => void startChat()}><Text style={styles.buttonText}>Iniciar chatbot</Text></TouchableOpacity>{chatSessionId ? <><TextInput style={styles.input} value={chatBody} onChangeText={setChatBody} placeholder="Escribe una consulta" /><TouchableOpacity style={styles.button} onPress={() => void sendChat()}><Text style={styles.buttonText}>Enviar consulta</Text></TouchableOpacity><Text style={styles.item}>{chatAnswer}</Text></> : null}</View>
  </View>;
}

const styles = Object.assign({ erpHint: { color: '#64748b', fontSize: 11, marginTop: 4 } }, {
  container: { marginBottom: 18 }, title: { fontSize: 20, fontWeight: '800', color: '#0f172a' }, subtitle: { color: '#64748b', marginBottom: 5 }, planHint: { color: '#1e40af', fontSize: 12, marginBottom: 10 }, card: { backgroundColor: '#fff', borderColor: '#dbe4f0', borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 }, cardTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800', marginBottom: 8 }, label: { color: '#475569', fontSize: 13, fontWeight: '700', marginBottom: 5 }, input: { borderColor: '#cbd5e1', borderRadius: 8, borderWidth: 1, color: '#0f172a', marginBottom: 8, padding: 10 }, multiline: { minHeight: 70, textAlignVertical: 'top' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }, chip: { borderColor: '#93c5fd', borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 }, chipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' }, chipText: { color: '#1e40af', fontSize: 12 }, button: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 8, marginBottom: 8, padding: 10 }, smallButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 8, marginBottom: 4, paddingHorizontal: 10, paddingVertical: 7 }, smallDangerButton: { alignItems: 'center', backgroundColor: '#b91c1c', borderRadius: 8, marginBottom: 4, paddingHorizontal: 10, paddingVertical: 7 }, secondaryButton: { alignItems: 'center', borderColor: '#94a3b8', borderRadius: 8, borderWidth: 1, marginBottom: 8, padding: 10 }, secondaryButtonText: { color: '#475569', fontWeight: '800' }, actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, buttonText: { color: '#fff', fontWeight: '800' }, item: { color: '#475569', fontSize: 13, marginTop: 6 }, itemBox: { borderTopColor: '#e2e8f0', borderTopWidth: 1, marginTop: 8, paddingTop: 8 }, bold: { fontWeight: '800' }, link: { color: '#1d4ed8', fontSize: 13, marginTop: 7 }, notice: { backgroundColor: '#eff6ff', borderRadius: 8, color: '#1e40af', marginBottom: 10, padding: 10 },
});
