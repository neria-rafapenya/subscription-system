import React, { useEffect, useState } from 'react';
import Swal from 'sweetalert2';

function formatDate(value) {
  if (!value) return '—';
  const normalized = String(value).includes('Z') || String(value).includes('+') ? String(value) : `${value}Z`;
  return new Date(normalized).toLocaleString('es-ES');
}

function countCard(label, value) {
  return <div className="item"><div><strong>{label}</strong><span>{value}</span></div></div>;
}

function dataTable(headers, rows) {
  if (!rows.length) return <p className="muted">Sin registros.</p>;
  return <div className="table-wrapper"><table className="customers-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows}</tbody></table></div>;
}

function optionList(items, valueKey = 'id', label = (item) => item.name) {
  return items.map((item) => <option key={item[valueKey]} value={item[valueKey]}>{label(item)}</option>);
}

export default function GestoriaBackoffice({ apiUrl }) {
  const [overview, setOverview] = useState(null);
  const [clients, setClients] = useState([]);
  const [advisors, setAdvisors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [chatSessions, setChatSessions] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [laborRequests, setLaborRequests] = useState([]);
  const [error, setError] = useState('');
  const [appointmentForm, setAppointmentForm] = useState({ customer_id: '', advisor_id: '', modality: 'presencial', scheduled_at: '', reason: '', status: 'confirmed' });
  const [messageForm, setMessageForm] = useState({ customer_id: '', subject: '', body: '' });
  const [notificationForm, setNotificationForm] = useState({ customer_id: '', type: 'manual', title: '', body: '', scheduled_for: '', status: 'scheduled' });
  const [documentForm, setDocumentForm] = useState({ customer_id: '', title: '', category: 'general', file: null });
  const [procedureForm, setProcedureForm] = useState({ customer_id: '', title: '', procedure_type: 'fiscal', status: 'in_progress', progress: 0, result: '' });
  const [laborForm, setLaborForm] = useState({ customer_id: '', request_type: 'vacaciones', subject: '', description: '', period_start: '', period_end: '' });

  // En desarrollo no aparece ningún token ni selector de activación. Si se
  // despliega integración/producción, el sistema puede inyectar uno sin
  // cambiar este panel ni exponerlo al usuario.
  const adminToken = import.meta.env.VITE_BACKOFFICE_ADMIN_TOKEN || '';

  const request = async (path, init = {}) => {
    const headers = { ...(init.headers || {}) };
    if (adminToken) headers['X-Backoffice-Token'] = adminToken;
    const response = await fetch(`${apiUrl}${path}`, { ...init, headers });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || `API error ${response.status}`);
    return body;
  };

  const load = async () => {
    try {
      const result = await Promise.all([
        request('/modules/gestoria/backoffice/overview'),
        request('/modules/gestoria/backoffice/clients'),
        request('/modules/gestoria/advisors'),
        request('/modules/gestoria/backoffice/appointments'),
        request('/modules/gestoria/backoffice/documents'),
        request('/modules/gestoria/backoffice/messages'),
        request('/modules/gestoria/backoffice/notifications'),
        request('/modules/gestoria/backoffice/chat/sessions'),
        request('/modules/gestoria/backoffice/procedures'),
        request('/modules/gestoria/backoffice/labor/requests'),
      ]);
      setOverview(result[0]); setClients(result[1]); setAdvisors(result[2]); setAppointments(result[3]);
      setDocuments(result[4]); setMessages(result[5]); setNotifications(result[6]); setChatSessions(result[7]); setProcedures(result[8]); setLaborRequests(result[9]);
      setError('');
      setAppointmentForm((current) => ({ ...current, customer_id: current.customer_id || result[1][0]?.id || '', advisor_id: current.advisor_id || result[2][0]?.id || '' }));
      setMessageForm((current) => ({ ...current, customer_id: current.customer_id || result[1][0]?.id || '' }));
      setNotificationForm((current) => ({ ...current, customer_id: current.customer_id || result[1][0]?.id || '' }));
      setDocumentForm((current) => ({ ...current, customer_id: current.customer_id || result[1][0]?.id || '' }));
      setProcedureForm((current) => ({ ...current, customer_id: current.customer_id || result[1][0]?.id || '' }));
      setLaborForm((current) => ({ ...current, customer_id: current.customer_id || result[1][0]?.id || '' }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el backoffice de Gestoría.');
    }
  };

  useEffect(() => { void load(); }, []);

  const sendJson = async (path, method, body) => request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const confirmDelete = async (title, path) => {
    const result = await Swal.fire({ icon: 'warning', title, text: 'Esta acción no se puede deshacer.', showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#dc2626' });
    if (!result.isConfirmed) return;
    try { await request(path, { method: 'DELETE' }); await load(); } catch (cause) { await Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: cause instanceof Error ? cause.message : 'Error desconocido.' }); }
  };

  const saveAppointment = async (event) => {
    event.preventDefault();
    try { await sendJson('/modules/gestoria/backoffice/appointments', 'POST', appointmentForm); await Swal.fire({ icon: 'success', title: 'Cita creada', timer: 1200, showConfirmButton: false }); await load(); }
    catch (cause) { await Swal.fire({ icon: 'error', title: 'No se pudo crear la cita', text: cause instanceof Error ? cause.message : 'Error desconocido.' }); }
  };

  const updateAppointmentStatus = async (item, status) => {
    try { await sendJson(`/modules/gestoria/backoffice/appointments/${item.id}`, 'PATCH', { status }); await load(); }
    catch (cause) { await Swal.fire({ icon: 'error', title: 'No se pudo actualizar la cita', text: cause instanceof Error ? cause.message : 'Error desconocido.' }); }
  };

  const uploadDocument = async (event) => {
    event.preventDefault();
    if (!documentForm.file) return;
    const form = new FormData();
    form.append('customer_id', documentForm.customer_id); form.append('title', documentForm.title || documentForm.file.name); form.append('category', documentForm.category); form.append('document', documentForm.file);
    try { await request('/modules/gestoria/backoffice/documents', { method: 'POST', body: form }); setDocumentForm((current) => ({ ...current, title: '', file: null })); event.target.reset(); await load(); }
    catch (cause) { await Swal.fire({ icon: 'error', title: 'No se pudo subir el documento', text: cause instanceof Error ? cause.message : 'Error desconocido.' }); }
  };

  const editDocument = async (item) => {
    const result = await Swal.fire({ title: 'Editar documento', html: '<input id="doc-title" class="swal2-input" placeholder="Título"><input id="doc-category" class="swal2-input" placeholder="Categoría">', didOpen: () => { document.getElementById('doc-title').value = item.title; document.getElementById('doc-category').value = item.category; }, showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar', preConfirm: () => ({ title: document.getElementById('doc-title').value, category: document.getElementById('doc-category').value }) });
    if (!result.isConfirmed) return;
    try { await sendJson(`/modules/gestoria/backoffice/documents/${item.id}`, 'PATCH', result.value); await load(); } catch (cause) { await Swal.fire({ icon: 'error', title: 'No se pudo actualizar', text: cause instanceof Error ? cause.message : 'Error desconocido.' }); }
  };

  const saveMessage = async (event) => {
    event.preventDefault();
    try { await sendJson('/modules/gestoria/backoffice/messages', 'POST', messageForm); setMessageForm((current) => ({ ...current, subject: '', body: '' })); await load(); }
    catch (cause) { await Swal.fire({ icon: 'error', title: 'No se pudo crear el mensaje', text: cause instanceof Error ? cause.message : 'Error desconocido.' }); }
  };

  const editMessage = async (item) => {
    const result = await Swal.fire({ title: 'Editar mensaje', html: '<input id="msg-subject" class="swal2-input" placeholder="Asunto"><textarea id="msg-body" class="swal2-textarea" placeholder="Mensaje"></textarea>', didOpen: () => { document.getElementById('msg-subject').value = item.subject; document.getElementById('msg-body').value = item.body; }, showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar', preConfirm: () => ({ subject: document.getElementById('msg-subject').value, body: document.getElementById('msg-body').value }) });
    if (!result.isConfirmed) return;
    try { await sendJson(`/modules/gestoria/backoffice/messages/${item.id}`, 'PATCH', result.value); await load(); } catch (cause) { await Swal.fire({ icon: 'error', title: 'No se pudo actualizar', text: cause instanceof Error ? cause.message : 'Error desconocido.' }); }
  };

  const saveNotification = async (event) => {
    event.preventDefault();
    try { await sendJson('/modules/gestoria/backoffice/notifications', 'POST', notificationForm); setNotificationForm((current) => ({ ...current, title: '', body: '', scheduled_for: '' })); await load(); }
    catch (cause) { await Swal.fire({ icon: 'error', title: 'No se pudo crear el aviso', text: cause instanceof Error ? cause.message : 'Error desconocido.' }); }
  };

  const editNotification = async (item) => {
    const result = await Swal.fire({ title: 'Editar notificación', html: '<input id="notification-title" class="swal2-input" placeholder="Título"><textarea id="notification-body" class="swal2-textarea" placeholder="Mensaje"></textarea><select id="notification-status" class="swal2-select"><option value="scheduled">Programada</option><option value="due">Pendiente</option><option value="sent">Enviada</option><option value="cancelled">Cancelada</option></select>', didOpen: () => { document.getElementById('notification-title').value = item.title; document.getElementById('notification-body').value = item.body; document.getElementById('notification-status').value = item.status; }, showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar', preConfirm: () => ({ title: document.getElementById('notification-title').value, body: document.getElementById('notification-body').value, status: document.getElementById('notification-status').value }) });
    if (!result.isConfirmed) return;
    try { await sendJson(`/modules/gestoria/backoffice/notifications/${item.id}`, 'PATCH', result.value); await load(); } catch (cause) { await Swal.fire({ icon: 'error', title: 'No se pudo actualizar', text: cause instanceof Error ? cause.message : 'Error desconocido.' }); }
  };

  const saveProcedure = async (event) => {
    event.preventDefault();
    try { await sendJson('/modules/gestoria/backoffice/procedures', 'POST', { ...procedureForm, progress: Number(procedureForm.progress) }); setProcedureForm((current) => ({ ...current, title: '', result: '', progress: 0 })); await load(); }
    catch (cause) { await Swal.fire({ icon: 'error', title: 'No se pudo crear el trámite', text: cause instanceof Error ? cause.message : 'Error desconocido.' }); }
  };

  const editProcedure = async (item) => {
    const result = await Swal.fire({ title: 'Actualizar trámite', html: '<input id="procedure-progress" class="swal2-input" type="number" min="0" max="100" placeholder="Progreso"><select id="procedure-status" class="swal2-select"><option value="in_progress">En curso</option><option value="waiting">En espera</option><option value="completed">Completado</option><option value="rejected">Rechazado</option><option value="cancelled">Cancelado</option></select><textarea id="procedure-result" class="swal2-textarea" placeholder="Resultado"></textarea>', didOpen: () => { document.getElementById('procedure-progress').value = item.progress; document.getElementById('procedure-status').value = item.status; document.getElementById('procedure-result').value = item.result || ''; }, showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar', preConfirm: () => ({ progress: Number(document.getElementById('procedure-progress').value), status: document.getElementById('procedure-status').value, result: document.getElementById('procedure-result').value }) });
    if (!result.isConfirmed) return;
    try { await sendJson(`/modules/gestoria/backoffice/procedures/${item.id}`, 'PATCH', result.value); await load(); } catch (cause) { await Swal.fire({ icon: 'error', title: 'No se pudo actualizar', text: cause instanceof Error ? cause.message : 'Error desconocido.' }); }
  };

  const saveLaborRequest = async (event) => {
    event.preventDefault();
    try { await sendJson('/modules/gestoria/backoffice/labor/requests', 'POST', { ...laborForm, period_start: laborForm.period_start || null, period_end: laborForm.period_end || null }); setLaborForm((current) => ({ ...current, subject: '', description: '', period_start: '', period_end: '' })); await load(); }
    catch (cause) { await Swal.fire({ icon: 'error', title: 'No se pudo crear la solicitud laboral', text: cause instanceof Error ? cause.message : 'Error desconocido.' }); }
  };

  const editLaborRequest = async (item) => {
    const result = await Swal.fire({ title: 'Actualizar solicitud laboral', html: '<select id="labor-status" class="swal2-select"><option value="submitted">Recibida</option><option value="in_review">En revisión</option><option value="completed">Completada</option><option value="rejected">Rechazada</option><option value="cancelled">Cancelada</option></select>', didOpen: () => { document.getElementById('labor-status').value = item.status; }, showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar', preConfirm: () => ({ status: document.getElementById('labor-status').value }) });
    if (!result.isConfirmed) return;
    try { await sendJson(`/modules/gestoria/backoffice/labor/requests/${item.id}`, 'PATCH', result.value); await load(); } catch (cause) { await Swal.fire({ icon: 'error', title: 'No se pudo actualizar', text: cause instanceof Error ? cause.message : 'Error desconocido.' }); }
  };

  const openClient = async (client) => {
    try {
      const detail = await request(`/modules/gestoria/backoffice/clients/${client.id}`);
      const lines = [
        `<p><strong>Correo:</strong> ${detail.client.email}</p>`,
        `<p><strong>Empresa:</strong> ${detail.profile?.company_name || '—'}</p>`,
        `<p><strong>Régimen fiscal:</strong> ${detail.profile?.tax_regime || '—'}</p>`,
        `<h3>Documentos (${detail.documents.length})</h3><ul>${detail.documents.map((item) => `<li><a href="${apiUrl}${item.url}" target="_blank" rel="noreferrer">${item.title}</a> · ${item.filename}</li>`).join('') || '<li>Sin documentos</li>'}</ul>`,
        `<h3>Citas (${detail.appointments.length})</h3><ul>${detail.appointments.map((item) => `<li>${formatDate(item.scheduled_at)} · ${item.advisor_name} · ${item.status}</li>`).join('') || '<li>Sin citas</li>'}</ul>`,
        `<h3>Mensajes (${detail.messages.length})</h3><ul>${detail.messages.map((item) => `<li><strong>${item.subject}</strong> · ${item.sender_type}</li>`).join('') || '<li>Sin mensajes</li>'}</ul>`,
        `<h3>Notificaciones (${detail.notifications.length})</h3><ul>${detail.notifications.map((item) => `<li>${item.title} · ${item.status}</li>`).join('') || '<li>Sin notificaciones</li>'}</ul>`,
        `<h3>Trámites (${detail.procedures.length})</h3><ul>${detail.procedures.map((item) => `<li>${item.title} · ${item.status} · ${item.progress}%</li>`).join('') || '<li>Sin trámites</li>'}</ul>`,
        `<h3>Solicitudes laborales (${detail.labor_requests.length})</h3><ul>${detail.labor_requests.map((item) => `<li>${item.request_type} · ${item.subject} · ${item.status}</li>`).join('') || '<li>Sin solicitudes laborales</li>'}</ul>`,
        `<h3>Chatbot (${detail.chat_sessions.length} sesiones)</h3>`,
      ];
      await Swal.fire({ title: client.name, html: `<div class="detail-modal">${lines.join('')}</div>`, width: 'min(900px, 95vw)', confirmButtonText: 'Cerrar' });
    } catch (cause) { await Swal.fire({ icon: 'error', title: 'No se pudo cargar la ficha', text: cause instanceof Error ? cause.message : 'Error desconocido.' }); }
  };

  return <>
    <section className="panel"><div className="section-heading"><div><h2>Estado de trámites</h2><p className="muted">Seguimiento del curso y resultado, con referencia de sincronización ERP.</p></div><span className="tag">{procedures.length}</span></div><form className="customer-form" onSubmit={saveProcedure}><select value={procedureForm.customer_id} onChange={(event) => setProcedureForm({ ...procedureForm, customer_id: event.target.value })}>{optionList(clients, 'id', (item) => item.name)}</select><input value={procedureForm.title} onChange={(event) => setProcedureForm({ ...procedureForm, title: event.target.value })} placeholder="Título del trámite" required /><input value={procedureForm.procedure_type} onChange={(event) => setProcedureForm({ ...procedureForm, procedure_type: event.target.value })} placeholder="Tipo de trámite" required /><button className="primary-button" type="submit">Crear trámite</button></form>{dataTable(['Trámite', 'Cliente', 'Estado', 'Progreso', 'ERP', 'Acciones'], procedures.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.procedure_type}</small></td><td>{item.customer_name}<small>{item.customer_email}</small></td><td>{item.status}</td><td>{item.progress}%<small>{item.result || 'Sin resultado'}</small></td><td>{item.erp_link_status || item.erp_sync_status || 'pendiente'}</td><td><div className="row-actions"><button className="secondary-button" onClick={() => void editProcedure(item)}>Actualizar</button><button className="danger-button" onClick={() => void confirmDelete('¿Eliminar este trámite?', `/modules/gestoria/backoffice/procedures/${item.id}`)}>Eliminar</button></div></td></tr>))}</section>
    <section className="panel"><div className="section-heading"><div><h2>Laboral (incidencias y nóminas)</h2><p className="muted">Solicitudes de vacaciones, altas, incidencias y nóminas listas para el ERP.</p></div><span className="tag">{laborRequests.length}</span></div><form className="customer-form" onSubmit={saveLaborRequest}><select value={laborForm.customer_id} onChange={(event) => setLaborForm({ ...laborForm, customer_id: event.target.value })}>{optionList(clients, 'id', (item) => item.name)}</select><select value={laborForm.request_type} onChange={(event) => setLaborForm({ ...laborForm, request_type: event.target.value })}><option value="vacaciones">Vacaciones</option><option value="alta">Alta</option><option value="incidencia">Incidencia</option><option value="nomina">Nómina</option></select><input value={laborForm.subject} onChange={(event) => setLaborForm({ ...laborForm, subject: event.target.value })} placeholder="Asunto" required /><input value={laborForm.description} onChange={(event) => setLaborForm({ ...laborForm, description: event.target.value })} placeholder="Descripción" required /><button className="primary-button" type="submit">Crear solicitud</button></form>{dataTable(['Cliente', 'Tipo', 'Asunto', 'Estado', 'ERP', 'Acciones'], laborRequests.map((item) => <tr key={item.id}><td>{item.customer_name}<small>{item.customer_email}</small></td><td>{item.request_type}</td><td>{item.subject}<small>{item.description}</small></td><td>{item.status}</td><td>{item.erp_link_status || item.erp_sync_status || 'pendiente'}</td><td><div className="row-actions"><button className="secondary-button" onClick={() => void editLaborRequest(item)}>Actualizar</button><button className="danger-button" onClick={() => void confirmDelete('¿Eliminar esta solicitud?', `/modules/gestoria/backoffice/labor/requests/${item.id}`)}>Eliminar</button></div></td></tr>))}</section>
    <section className="panel">
      <div className="section-heading"><div><h2>Gestoría</h2><p className="muted">Backoffice sectorial preparado directamente para este cliente. No requiere activar ningún token de módulo en desarrollo.</p></div><button className="secondary-button" onClick={() => void load()}>Actualizar</button></div>
      {error && <p className="error">{error}</p>}
      {overview ? <div className="grid">{countCard('Clientes', overview.clients)}{countCard('Documentos', overview.documents)}{countCard('Citas abiertas', overview.appointments)}{countCard('Avisos pendientes', overview.due_notifications)}{countCard('Mensajes sin leer', overview.unread_messages)}{countCard('Sesiones de chatbot', overview.chat_sessions)}</div> : <p className="muted">Cargando indicadores…</p>}
    </section>

    <section className="panel"><div className="section-heading"><div><h2>Clientes de la gestoría</h2><p className="muted">Consulta rápida del contexto de cada cliente.</p></div><span className="tag">{clients.length}</span></div>{dataTable(['Cliente', 'Empresa / régimen', 'Documentos', 'Citas', 'Acciones'], clients.map((client) => <tr key={client.id}><td><strong>{client.name}</strong><small>{client.email}</small></td><td>{client.company_name || '—'}<small>{client.tax_regime || 'Régimen no informado'}</small></td><td>{client.document_count}</td><td>{client.appointment_count}</td><td><button className="secondary-button" onClick={() => void openClient(client)}>Ver ficha</button></td></tr>))}</section>

    <section className="panel"><div className="section-heading"><div><h2>Citas</h2><p className="muted">Alta, consulta, cambio de estado y eliminación.</p></div><span className="tag">{appointments.length}</span></div><form className="customer-form" onSubmit={saveAppointment}><select value={appointmentForm.customer_id} onChange={(event) => setAppointmentForm({ ...appointmentForm, customer_id: event.target.value })}>{optionList(clients, 'id', (item) => `${item.name} · ${item.email}`)}</select><select value={appointmentForm.advisor_id} onChange={(event) => setAppointmentForm({ ...appointmentForm, advisor_id: event.target.value })}>{optionList(advisors, 'id', (item) => `${item.name} · ${item.specialty}`)}</select><select value={appointmentForm.modality} onChange={(event) => setAppointmentForm({ ...appointmentForm, modality: event.target.value })}><option value="presencial">Presencial</option><option value="videollamada">Videollamada</option><option value="telefonica">Telefónica</option></select><input type="datetime-local" value={appointmentForm.scheduled_at} onChange={(event) => setAppointmentForm({ ...appointmentForm, scheduled_at: event.target.value })} required /><input value={appointmentForm.reason} onChange={(event) => setAppointmentForm({ ...appointmentForm, reason: event.target.value })} placeholder="Motivo" required /><button className="primary-button" type="submit">Crear cita</button></form>{dataTable(['Fecha', 'Cliente', 'Asesor', 'Estado', 'Acciones'], appointments.map((item) => <tr key={item.id}><td>{formatDate(item.scheduled_at)}</td><td>{item.customer_name}<small>{item.customer_email}</small></td><td>{item.advisor_name}<small>{item.specialty}</small></td><td><select value={item.status} onChange={(event) => void updateAppointmentStatus(item, event.target.value)}><option value="requested">Solicitada</option><option value="confirmed">Confirmada</option><option value="cancelled">Cancelada</option><option value="completed">Completada</option></select></td><td><button className="danger-button" onClick={() => void confirmDelete('¿Eliminar esta cita?', `/modules/gestoria/backoffice/appointments/${item.id}`)}>Eliminar</button></td></tr>))}</section>

    <section className="panel"><div className="section-heading"><div><h2>Documentación</h2><p className="muted">Los clientes pueden subir documentos y la gestoría puede administrarlos aquí.</p></div><span className="tag">{documents.length}</span></div><form className="customer-form" onSubmit={uploadDocument}><select value={documentForm.customer_id} onChange={(event) => setDocumentForm({ ...documentForm, customer_id: event.target.value })}>{optionList(clients, 'id', (item) => item.name)}</select><input value={documentForm.title} onChange={(event) => setDocumentForm({ ...documentForm, title: event.target.value })} placeholder="Título opcional" /><input value={documentForm.category} onChange={(event) => setDocumentForm({ ...documentForm, category: event.target.value })} placeholder="Categoría" /><input type="file" onChange={(event) => setDocumentForm({ ...documentForm, file: event.target.files?.[0] || null })} required /><button className="primary-button" type="submit">Subir documento</button></form>{dataTable(['Documento', 'Cliente', 'Categoría', 'Fecha', 'Acciones'], documents.map((item) => <tr key={item.id}><td><a href={`${apiUrl}${item.url}`} target="_blank" rel="noreferrer">{item.title}</a><small>{item.filename}</small></td><td>{item.customer_name}<small>{item.customer_email}</small></td><td>{item.category}</td><td>{formatDate(item.created_at)}</td><td><div className="row-actions"><button className="secondary-button" onClick={() => void editDocument(item)}>Editar</button><button className="danger-button" onClick={() => void confirmDelete('¿Eliminar este documento?', `/modules/gestoria/backoffice/documents/${item.id}`)}>Eliminar</button></div></td></tr>))}</section>

    <section className="panel"><div className="section-heading"><div><h2>Mensajes</h2><p className="muted">Comunicación bidireccional con los clientes.</p></div><span className="tag">{messages.length}</span></div><form className="customer-form" onSubmit={saveMessage}><select value={messageForm.customer_id} onChange={(event) => setMessageForm({ ...messageForm, customer_id: event.target.value })}>{optionList(clients, 'id', (item) => item.name)}</select><input value={messageForm.subject} onChange={(event) => setMessageForm({ ...messageForm, subject: event.target.value })} placeholder="Asunto" required /><input value={messageForm.body} onChange={(event) => setMessageForm({ ...messageForm, body: event.target.value })} placeholder="Mensaje" required /><button className="primary-button" type="submit">Enviar mensaje</button></form>{dataTable(['Cliente', 'Asunto', 'Mensaje', 'Estado', 'Acciones'], messages.map((item) => <tr key={item.id}><td>{item.customer_name}<small>{item.sender_type}</small></td><td>{item.subject}</td><td>{item.body}</td><td>{item.read_at ? 'Leído' : 'Sin leer'}</td><td><div className="row-actions"><button className="secondary-button" onClick={() => void sendJson(`/modules/gestoria/backoffice/messages/${item.id}`, 'PATCH', { read: true }).then(load)}>Marcar leído</button><button className="secondary-button" onClick={() => void editMessage(item)}>Editar</button><button className="danger-button" onClick={() => void confirmDelete('¿Eliminar este mensaje?', `/modules/gestoria/backoffice/messages/${item.id}`)}>Eliminar</button></div></td></tr>))}</section>

    <section className="panel"><div className="section-heading"><div><h2>Notificaciones</h2><p className="muted">Avisos automáticos de citas y mensajes manuales.</p></div><span className="tag">{notifications.length}</span></div><form className="customer-form" onSubmit={saveNotification}><select value={notificationForm.customer_id} onChange={(event) => setNotificationForm({ ...notificationForm, customer_id: event.target.value })}>{optionList(clients, 'id', (item) => item.name)}</select><input value={notificationForm.title} onChange={(event) => setNotificationForm({ ...notificationForm, title: event.target.value })} placeholder="Título" required /><input value={notificationForm.body} onChange={(event) => setNotificationForm({ ...notificationForm, body: event.target.value })} placeholder="Contenido" required /><input type="datetime-local" value={notificationForm.scheduled_for} onChange={(event) => setNotificationForm({ ...notificationForm, scheduled_for: event.target.value })} required /><button className="primary-button" type="submit">Crear aviso</button></form>{dataTable(['Aviso', 'Cliente', 'Programado', 'Estado', 'Acciones'], notifications.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.body}</small></td><td>{item.customer_name}</td><td>{formatDate(item.scheduled_for)}</td><td>{item.status}</td><td><div className="row-actions"><button className="secondary-button" onClick={() => void editNotification(item)}>Editar</button><button className="danger-button" onClick={() => void confirmDelete('¿Eliminar esta notificación?', `/modules/gestoria/backoffice/notifications/${item.id}`)}>Eliminar</button></div></td></tr>))}</section>

    <section className="panel"><div className="section-heading"><div><h2>Chatbot IA</h2><p className="muted">Sesiones registradas. El proveedor IA se conectará en una fase posterior.</p></div><span className="tag">{chatSessions.length}</span></div>{dataTable(['Cliente', 'Estado', 'Inicio', 'Mensajes'], chatSessions.map((session) => <tr key={session.id}><td>{session.customer_name}<small>{session.customer_email}</small></td><td>{session.status}</td><td>{formatDate(session.created_at)}</td><td>{session.messages?.length || 0}<small>{session.messages?.slice(-1)[0]?.body || 'Sin mensajes'}</small></td></tr>))}</section>
  </>;
}
