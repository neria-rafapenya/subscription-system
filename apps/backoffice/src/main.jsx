import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Swal from 'sweetalert2';
import './styles.css';
import { getModuleBackoffice } from './moduleRegistry';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

async function get(path) {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) throw new Error(`API error ${response.status}`);
  return response.json();
}

async function send(path, method, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.detail || `API error ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

function escapeHtml(value) {
  return String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function formatDate(value) {
  if (!value) return '—';
  const normalized = String(value).includes('Z') || String(value).includes('+') ? String(value) : `${value}Z`;
  return new Date(normalized).toLocaleString('es-ES');
}

function detailTable(headers, rows) {
  if (!rows.length) return '<p style="color:#64748b">Sin registros.</p>';
  return `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px"><thead><tr>${headers.map((header) => `<th style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td style="padding:8px;border-bottom:1px solid #f1f5f9;vertical-align:top">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

async function updateSubscription(subscriptionId, status) {
  await send(`/subscriptions/${subscriptionId}/status`, 'PATCH', { status });
}

function App() {
  const [plans, setPlans] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [customerForm, setCustomerForm] = useState({ name: '', email: '', cognito_sub: '' });
  const [customerPage, setCustomerPage] = useState(1);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [customerTotalPages, setCustomerTotalPages] = useState(1);
  const [customerSort, setCustomerSort] = useState('created_at');
  const [customerDirection, setCustomerDirection] = useState('desc');

  const load = async (requestedPage = customerPage, requestedSort = customerSort, requestedDirection = customerDirection) => {
    try {
      const [planData, customerData, subscriptionData, notificationData, configData] = await Promise.all([
        get('/plans'),
        get(`/customers?page=${requestedPage}&page_size=10&sort=${requestedSort}&direction=${requestedDirection}`),
        get('/subscriptions'),
        get('/notifications'),
        get('/config'),
      ]);
      setPlans(planData);
      setCustomers(customerData.items);
      setCustomerTotal(customerData.total);
      setCustomerTotalPages(customerData.total_pages);
      setSubscriptions(subscriptionData);
      setNotifications(notificationData);
      setConfig(configData);
      setError('');
    } catch (cause) {
      console.error(cause);
      setError(`No se pudo conectar con el backend local en ${API_URL}. Comprueba que FastAPI está activo.`);
    }
  };

  useEffect(() => { void load(); }, []);

  const changeStatus = async (id, status) => {
    try {
      await updateSubscription(id, status);
      await load();
    } catch (cause) {
      await Swal.fire({ icon: 'error', title: 'No se pudo actualizar', text: cause instanceof Error ? cause.message : 'No se pudo actualizar la suscripción.' });
    }
  };

  const resetCustomerForm = () => {
    setEditingCustomerId(null);
    setCustomerForm({ name: '', email: '', cognito_sub: '' });
  };

  const sortCustomers = (sort) => {
    const nextDirection = customerSort === sort && customerDirection === 'asc' ? 'desc' : 'asc';
    setCustomerSort(sort);
    setCustomerDirection(nextDirection);
    setCustomerPage(1);
    void load(1, sort, nextDirection);
  };

  const goToCustomerPage = (page) => {
    if (page < 1 || page > customerTotalPages) return;
    setCustomerPage(page);
    void load(page, customerSort, customerDirection);
  };

  const editCustomer = (customer) => {
    setEditingCustomerId(customer.id);
    setCustomerForm({ name: customer.name, email: customer.email, cognito_sub: customer.cognito_sub || '' });
    setError('');
  };

  const openCustomerDetail = async (customer) => {
    Swal.fire({ title: 'Cargando cliente…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const detail = await get(`/customers/${customer.id}`);
      Swal.close();
      const profile = detail.customer;
      const profileHtml = `<div style="text-align:left;display:grid;gap:6px"><div><strong>Nombre:</strong> ${escapeHtml(profile.name)}</div><div><strong>Correo:</strong> ${escapeHtml(profile.email)}</div><div><strong>ID:</strong> ${escapeHtml(profile.id)}</div><div><strong>Cognito sub:</strong> ${escapeHtml(profile.cognito_sub)}</div><div><strong>Fecha de alta:</strong> ${escapeHtml(formatDate(profile.created_at))}</div><div><strong>Dirección de facturación:</strong> ${escapeHtml(profile.billing_address)}</div><div><strong>DNI/NIF:</strong> ${escapeHtml(profile.tax_id)}</div><div><strong>Políticas:</strong> ${profile.policies_accepted_at ? `Aceptadas · ${escapeHtml(profile.policies_version)} · ${escapeHtml(formatDate(profile.policies_accepted_at))}` : 'Pendientes'}</div></div>`;
      const subscriptionsHtml = detailTable(['Plan', 'Estado', 'Importe', 'Renovación', 'Fin de periodo'], detail.subscriptions.map((item) => [escapeHtml(item.plan_name), escapeHtml(item.status), `${escapeHtml((item.amount_cents / 100).toFixed(2))} ${escapeHtml(item.currency)}`, item.auto_renew ? 'Automática' : 'No renueva', escapeHtml(formatDate(item.current_period_end))]));
      const checkoutsHtml = detailTable(['ID', 'Plan', 'Proveedor', 'Estado', 'Importe', 'Políticas'], detail.checkouts.map((item) => [escapeHtml(item.id), escapeHtml(item.plan_name), escapeHtml(item.provider), escapeHtml(item.status), `${escapeHtml((item.amount_cents / 100).toFixed(2))} ${escapeHtml(item.currency)}`, item.policies_accepted_at ? `${escapeHtml(item.policies_version)} · ${escapeHtml(formatDate(item.policies_accepted_at))}` : '—']));
      const notificationsHtml = detailTable(['Título', 'Estado', 'Fecha'], detail.notifications.map((item) => [escapeHtml(item.title), escapeHtml(item.status), escapeHtml(formatDate(item.created_at))]));
      await Swal.fire({ title: escapeHtml(profile.name), html: `<div class="detail-modal"><h3>Perfil</h3>${profileHtml}<h3>Suscripciones</h3>${subscriptionsHtml}<h3>Checkouts</h3>${checkoutsHtml}<h3>Notificaciones</h3>${notificationsHtml}</div>`, width: 'min(960px, 94vw)', confirmButtonText: 'Cerrar' });
    } catch (cause) {
      Swal.close();
      await Swal.fire({ icon: 'error', title: 'No se pudo cargar el detalle', text: cause instanceof Error ? cause.message : 'Error desconocido.' });
    }
  };

  const saveCustomer = async (event) => {
    event.preventDefault();
    try {
      if (editingCustomerId) {
        await send(`/customers/${editingCustomerId}`, 'PATCH', customerForm);
        await Swal.fire({ icon: 'success', title: 'Cliente actualizado', timer: 1500, showConfirmButton: false });
      } else {
        await send('/customers', 'POST', customerForm);
        await Swal.fire({ icon: 'success', title: 'Cliente creado', timer: 1500, showConfirmButton: false });
      }
      resetCustomerForm();
      await load();
    } catch (cause) {
      await Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: cause instanceof Error ? cause.message : 'No se pudo guardar el cliente.' });
    }
  };

  const removeCustomer = async (customer) => {
    const confirmation = await Swal.fire({
      icon: 'warning',
      title: `¿Eliminar a ${customer.name}?`,
      text: 'Esta acción solo es posible si no tiene historial asociado.',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!confirmation.isConfirmed) return;
    try {
      await send(`/customers/${customer.id}`, 'DELETE');
      await Swal.fire({ icon: 'success', title: 'Cliente eliminado', timer: 1500, showConfirmButton: false });
      await load();
    } catch (cause) {
      await Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: cause instanceof Error ? cause.message : 'No se pudo eliminar el cliente.' });
    }
  };

  const changePrice = async (plan) => {
    const priceInput = await Swal.fire({
      title: `Nuevo precio para ${plan.name}`,
      input: 'number',
      inputValue: (plan.amount_cents / 100).toFixed(2),
      inputAttributes: { min: '0.01', step: '0.01' },
      text: `Importe en ${plan.currency}`,
      showCancelButton: true,
      confirmButtonText: 'Continuar',
      cancelButtonText: 'Cancelar',
      inputValidator: (value) => {
        const normalized = Number(value);
        return Number.isFinite(normalized) && normalized > 0 ? undefined : 'Introduce un importe positivo.';
      },
    });
    if (!priceInput.isConfirmed) return;
    const normalized = Number(priceInput.value);
    const confirmed = await Swal.fire({
      icon: 'warning',
      title: 'Confirmar cambio de precio',
      text: '¿Está seguro? Esta acción cambiará el precio para nuevas suscripciones y enviará una notificación a los usuarios para que puedan renovar la suscripción o anularla en caso de no estar de acuerdo. Las suscripciones activas conservarán su precio actual.',
      showCancelButton: true,
      confirmButtonText: 'Sí, cambiar precio',
      cancelButtonText: 'Cancelar',
    });
    if (!confirmed.isConfirmed) return;
    try {
      const result = await send(`/plans/${plan.id}/price`, 'PATCH', { amount_cents: Math.round(normalized * 100), confirmed: true });
      await Swal.fire({ icon: 'success', title: 'Precio actualizado', text: `${result.notifications_queued} notificaciones encoladas.`, timer: 1800, showConfirmButton: false });
      await load();
    } catch (cause) {
      await Swal.fire({ icon: 'error', title: 'No se pudo actualizar el precio', text: cause instanceof Error ? cause.message : 'Error desconocido.' });
    }
  };

  const ModuleBackoffice = config?.vertical_module ? getModuleBackoffice(config.vertical_module) : null;

  return (
    <main className="layout">
      <header className="header">
        <div>
          <p className="eyebrow">SUBSCRIPTION SYSTEM · {config?.vertical_module || 'cargando'}</p>
          <h1>Backoffice local</h1>
          <p className="muted">Área de decisión del motor de suscripciones{config?.vertical_display_name ? ` · ${config.vertical_display_name}` : ''}.</p>
        </div>
        <div className="environment">{config?.environment || 'cargando'}</div>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="grid">
        <article className="panel plans-panel">
          <h2>Planes</h2>
          <p className="muted">La estructura que luego podrá editar el cliente.</p>
          {plans.map((plan) => <div className="item" key={plan.id}><div><strong>{plan.name}</strong><span>{(plan.amount_cents / 100).toFixed(2)} {plan.currency} · {plan.interval}</span></div><button className="secondary-button" onClick={() => void changePrice(plan)}>Cambiar precio</button></div>)}
        </article>

      </section>

      {ModuleBackoffice ? <ModuleBackoffice apiUrl={API_URL} /> : null}

      <section className="panel">
        <div className="section-heading"><div><h2>Clientes</h2><p className="muted">Gestión de los usuarios del cliente administrador.</p></div><span className="tag">{customerTotal} clientes</span></div>
        <form className="customer-form" onSubmit={saveCustomer}>
          <input value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} placeholder="Nombre completo" required />
          <input type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} placeholder="Correo electrónico" required />
          <input value={customerForm.cognito_sub} onChange={(event) => setCustomerForm({ ...customerForm, cognito_sub: event.target.value })} placeholder="Cognito sub (opcional)" />
          <div className="form-actions"><button className="primary-button" type="submit">{editingCustomerId ? 'Guardar cambios' : 'Crear cliente'}</button>{editingCustomerId ? <button className="secondary-button" type="button" onClick={resetCustomerForm}>Cancelar edición</button> : null}</div>
        </form>
        {customers.length === 0 ? <p className="muted">Todavía no hay clientes.</p> : <>
          <div className="table-wrapper">
            <table className="customers-table">
              <thead><tr><th><button className="table-sort" onClick={() => sortCustomers('name')}>Nombre {customerSort === 'name' ? (customerDirection === 'asc' ? '↑' : '↓') : ''}</button></th><th>Correo</th><th><button className="table-sort" onClick={() => sortCustomers('created_at')}>Fecha de alta {customerSort === 'created_at' ? (customerDirection === 'asc' ? '↑' : '↓') : ''}</button></th><th>Suscripciones</th><th>Checkouts pendientes</th><th>Acciones</th></tr></thead>
              <tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong><small>{customer.cognito_sub ? `Cognito: ${customer.cognito_sub}` : 'Sin Cognito asignado'}</small></td><td>{customer.email}<small>{customer.billing_address ? `DNI/NIF: ${customer.tax_id || '—'}` : 'Datos de facturación pendientes'}</small></td><td>{new Date(`${customer.created_at}Z`).toLocaleString('es-ES')}</td><td>{customer.subscription_count} históricas · {customer.current_subscription_count} vigentes</td><td>{customer.pending_checkout_count > 0 ? <strong className="pending-label">{customer.pending_checkout_count} pendiente{customer.pending_checkout_count === 1 ? '' : 's'}</strong> : '—'}</td><td><div className="row-actions"><button className="secondary-button" onClick={() => void openCustomerDetail(customer)}>Ver detalle</button><button className="secondary-button" onClick={() => editCustomer(customer)}>Editar</button><button className="danger-button" onClick={() => void removeCustomer(customer)}>Eliminar</button></div></td></tr>)}</tbody>
            </table>
          </div>
          <div className="pagination"><button className="secondary-button" disabled={customerPage <= 1} onClick={() => goToCustomerPage(customerPage - 1)}>Anterior</button><span>Página {customerPage} de {customerTotalPages}</span><button className="secondary-button" disabled={customerPage >= customerTotalPages} onClick={() => goToCustomerPage(customerPage + 1)}>Siguiente</button></div>
        </>}
      </section>

      <section className="panel">
        <div className="section-heading"><div><h2>Notificaciones de precio</h2><p className="muted">Cola local de avisos generados por cambios de plan.</p></div><span className="tag">{notifications.length} notificaciones</span></div>
        {notifications.length === 0 ? <p className="muted">No hay notificaciones pendientes.</p> : notifications.slice(0, 10).map((notification) => (
          <div className="item" key={notification.id}><div><strong>{notification.customer_name} · {notification.customer_email}</strong><span>{notification.title} · {notification.status}</span></div></div>
        ))}
      </section>

      <section className="panel">
        <div className="section-heading"><div><h2>Suscripciones</h2><p className="muted">Cambio manual de estado solo para desarrollo.</p></div><span className="tag">{subscriptions.length} registros</span></div>
        {subscriptions.length === 0 ? <p className="muted">Todavía no hay suscripciones.</p> : subscriptions.map((subscription) => (
          <div className="subscription" key={subscription.id}>
            <div><strong>{subscription.plan_name}</strong><span>Usuario: {subscription.user_id} · {subscription.customer_name} · {subscription.customer_email}</span><span>{subscription.id} · {subscription.status} · {subscription.auto_renew ? 'renovación automática' : 'no renueva'}</span><span>Periodo actual hasta: {subscription.current_period_end}</span><span>{subscription.cancel_at_period_end ? 'Cancelada al finalizar el periodo' : 'Se mantiene vigente según el circuito de pago'}</span></div>
            <select value={subscription.status} onChange={(event) => void changeStatus(subscription.id, event.target.value)}>
              {['active', 'suspended', ...(subscription.status === 'pending' ? ['pending'] : []), ...(subscription.status === 'grace_period' ? ['grace_period'] : [])].map((status) => <option key={status} value={status} disabled={status !== 'active' && status !== 'suspended'}>{status}</option>)}
            </select>
          </div>
        ))}
      </section>

      <section className="panel notes">
        <h2>Configuración observada</h2>
        <div className="facts"><span>Entorno</span><strong>{config?.environment || '—'}</strong><span>Módulo sectorial</span><strong>{config?.vertical_display_name || config?.vertical_module || '—'}</strong><span>Autenticación</span><strong>{config?.local_auth_enabled ? 'local' : 'Cognito pendiente'}</strong><span>Pago</span><strong>{config?.payment_provider || '—'}</strong></div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
