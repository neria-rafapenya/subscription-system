import React, { useEffect, useState } from 'react';
import Swal from 'sweetalert2';

function escapeHtml(value) {
  return String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

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

export default function SanidadBackoffice({ apiUrl }) {
  const [adminToken, setAdminToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [overview, setOverview] = useState(null);
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');

  const get = async (path) => {
    const response = await fetch(`${apiUrl}${path}`, { headers: { 'X-Backoffice-Token': adminToken } });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.detail || `API error ${response.status}`);
    }
    return response.json();
  };

  const load = async () => {
    try {
      const [overviewData, patientData, appointmentData, documentData, notificationData] = await Promise.all([
        get('/modules/sanidad/backoffice/overview'),
        get('/modules/sanidad/backoffice/patients'),
        get('/modules/sanidad/backoffice/appointments'),
        get('/modules/sanidad/backoffice/documents'),
        get('/modules/sanidad/backoffice/notifications'),
      ]);
      setOverview(overviewData);
      setPatients(patientData);
      setAppointments(appointmentData);
      setDocuments(documentData);
      setNotifications(notificationData);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el módulo de Sanidad.');
    }
  };

  useEffect(() => { if (adminToken) void load(); }, [adminToken]);

  const openPatient = async (patient) => {
    Swal.fire({ title: 'Cargando historia sanitaria…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const detail = await get(`/modules/sanidad/backoffice/patients/${patient.id}`);
      const profile = detail.profile || {};
      const patientHtml = `<div class="detail-modal"><h3>Paciente</h3><p><strong>Nombre:</strong> ${escapeHtml(detail.patient.name)}</p><p><strong>Correo:</strong> ${escapeHtml(detail.patient.email)}</p><p><strong>Fecha de alta:</strong> ${escapeHtml(formatDate(detail.patient.created_at))}</p><h3>Perfil sanitario</h3><p><strong>Fecha de nacimiento:</strong> ${escapeHtml(profile.birth_date)}</p><p><strong>Alergias:</strong> ${escapeHtml(profile.allergies)}</p><p><strong>Patologías:</strong> ${escapeHtml(profile.conditions)}</p><p><strong>Medicación:</strong> ${escapeHtml(profile.medications)}</p><p><strong>Contacto de emergencia:</strong> ${escapeHtml(profile.emergency_contact)}</p><p><strong>Notas:</strong> ${escapeHtml(profile.notes)}</p><h3>Documentos</h3>${detail.documents.length ? `<ul>${detail.documents.map((item) => `<li><a href="${escapeHtml(`${apiUrl}${item.url}`)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)} · ${escapeHtml(item.filename)}</a> · ${escapeHtml(formatDate(item.created_at))}</li>`).join('')}</ul>` : '<p>Sin documentos.</p>'}<h3>Citas y visitas</h3>${detail.appointments.length ? `<ul>${detail.appointments.map((item) => `<li>${escapeHtml(formatDate(item.scheduled_at))} · ${escapeHtml(item.doctor_name)} · ${escapeHtml(item.modality)} · ${escapeHtml(item.status)}</li>`).join('')}</ul>` : '<p>Sin citas.</p>'}<h3>Diagnósticos e informes</h3>${detail.reports.length ? `<ul>${detail.reports.map((item) => `<li><strong>${escapeHtml(item.title)}</strong> · ${escapeHtml(item.report_type)} · ${escapeHtml(formatDate(item.issued_at))}<br>${escapeHtml(item.content)}</li>`).join('')}</ul>` : '<p>Sin informes.</p>'}<h3>Mensajes</h3>${detail.messages.length ? `<ul>${detail.messages.map((item) => `<li><strong>${escapeHtml(item.subject)}</strong> · ${escapeHtml(item.sender_type)} · ${escapeHtml(formatDate(item.created_at))}<br>${escapeHtml(item.body)}</li>`).join('')}</ul>` : '<p>Sin mensajes.</p>'}<h3>Notificaciones</h3>${detail.notifications.length ? `<ul>${detail.notifications.map((item) => `<li>${escapeHtml(item.title)} · ${escapeHtml(item.status)} · ${escapeHtml(formatDate(item.scheduled_for))}</li>`).join('')}</ul>` : '<p>Sin notificaciones.</p>'}<h3>Chatbot</h3><p>${detail.chat_sessions.length ? `${detail.chat_sessions.length} conversación(es) registrada(s).` : 'Sin conversaciones.'}</p></div>`;
      Swal.close();
      await Swal.fire({ title: escapeHtml(detail.patient.name), html: patientHtml, width: 'min(980px, 95vw)', confirmButtonText: 'Cerrar' });
    } catch (cause) {
      Swal.close();
      await Swal.fire({ icon: 'error', title: 'No se pudo cargar la historia sanitaria', text: cause instanceof Error ? cause.message : 'Error desconocido.' });
    }
  };

  if (!adminToken) {
    return <section className="panel">
      <h2>Sanidad</h2>
      <p className="muted">El módulo contiene información sanitaria protegida. Introduce el token administrativo para abrir este panel.</p>
      <form className="customer-form" onSubmit={(event) => { event.preventDefault(); if (tokenInput.trim()) setAdminToken(tokenInput.trim()); }}>
        <input type="password" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} placeholder="Token administrativo" autoComplete="off" required />
        <button className="primary-button" type="submit">Abrir módulo sanitario</button>
      </form>
    </section>;
  }

  return <>
    <section className="panel">
      <div className="section-heading"><div><h2>Sanidad</h2><p className="muted">Panel sectorial: pacientes, citas, documentos, informes y comunicaciones.</p></div><button className="secondary-button" onClick={() => void load()}>Actualizar</button></div>
      {error && <p className="error">{error}</p>}
      {overview ? <div className="grid">{countCard('Pacientes', overview.patients)}{countCard('Documentos', overview.documents)}{countCard('Citas abiertas', overview.appointments)}{countCard('Informes', overview.reports)}{countCard('Avisos pendientes', overview.due_notifications)}{countCard('Mensajes sin leer', overview.unread_messages)}</div> : <p className="muted">Cargando indicadores…</p>}
    </section>

    <section className="panel">
      <div className="section-heading"><div><h2>Pacientes</h2><p className="muted">Acceso a la ficha sanitaria completa, sujeto al token administrativo del módulo.</p></div><span className="tag">{patients.length}</span></div>
      {dataTable(['Paciente', 'Perfil', 'Documentos', 'Citas', 'Informes', 'Acciones'], patients.map((patient) => <tr key={patient.id}><td><strong>{patient.name}</strong><small>{patient.email}</small></td><td>{patient.conditions || 'Sin patologías registradas'}<small>{patient.allergies ? `Alergias: ${patient.allergies}` : 'Alergias no registradas'}</small></td><td>{patient.document_count}</td><td>{patient.appointment_count}</td><td>{patient.report_count}</td><td><button className="secondary-button" onClick={() => void openPatient(patient)}>Ver historia completa</button></td></tr>))}
    </section>

    <section className="panel">
      <div className="section-heading"><div><h2>Citas y visitas</h2><p className="muted">Agenda global del módulo.</p></div><span className="tag">{appointments.length}</span></div>
      {dataTable(['Fecha', 'Paciente', 'Médico', 'Modalidad', 'Estado'], appointments.map((item) => <tr key={item.id}><td>{formatDate(item.scheduled_at)}</td><td>{item.customer_name}<small>{item.customer_email}</small></td><td>{item.doctor_name}<small>{item.specialty}</small></td><td>{item.modality}</td><td>{item.status}</td></tr>))}
    </section>

    <section className="panel">
      <div className="section-heading"><div><h2>Documentos compartidos</h2><p className="muted">Documentos subidos por los pacientes, disponibles para consulta administrativa autorizada.</p></div><span className="tag">{documents.length}</span></div>
      {dataTable(['Documento', 'Paciente', 'Categoría', 'Fecha'], documents.map((item) => <tr key={item.id}><td><a href={`${apiUrl}${item.url}`} target="_blank" rel="noreferrer">{item.title}</a><small>{item.filename}</small></td><td>{item.customer_name}<small>{item.customer_email}</small></td><td>{item.category}</td><td>{formatDate(item.created_at)}</td></tr>))}
    </section>

    <section className="panel">
      <div className="section-heading"><div><h2>Notificaciones</h2><p className="muted">Recordatorios de citas y avisos generados por el módulo.</p></div><span className="tag">{notifications.length}</span></div>
      {dataTable(['Aviso', 'Paciente', 'Programado', 'Estado'], notifications.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.body}</small></td><td>{item.customer_name}</td><td>{formatDate(item.scheduled_for)}</td><td>{item.status}</td></tr>))}
    </section>
  </>;
}
