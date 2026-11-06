import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { api, AppConfig, AuthUser, environment, Notification, PayPalConfig, PendingCheckout, Plan, Service, Subscription } from './src/api';
import { getClientModule } from './src/moduleRegistry';
import { AppDialog, AppDialogState } from './src/components/AppDialog';
import { BrandLogo } from './src/components/BrandLogo';
import { PayPalSubscriptionCheckout } from './src/components/PayPalSubscriptionCheckout';
import { PolicyModal } from './src/components/PolicyModal';
import { normalizeSpanishPersonId } from './src/validation';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';
type AppScreen = 'home' | 'appointments' | 'documents' | 'procedures' | 'labor' | 'messages' | 'notifications' | 'chatbot' | 'catalog' | 'subscriptions';

export default function App() {
  const [services, setServices] = useState<Service[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [pendingCheckouts, setPendingCheckouts] = useState<PendingCheckout[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('demo@example.test');
  const [password, setPassword] = useState('demo');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [checkoutPlanName, setCheckoutPlanName] = useState<string | null>(null);
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [checkoutProvider, setCheckoutProvider] = useState<string | null>(null);
  const [checkoutProviderSubscriptionId, setCheckoutProviderSubscriptionId] = useState<string | null>(null);
  const [paypalConfig, setPaypalConfig] = useState<PayPalConfig | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [billingAddress, setBillingAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [policyModalVisible, setPolicyModalVisible] = useState(false);
  const [dialog, setDialog] = useState<AppDialogState | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [freeToolsVisible, setFreeToolsVisible] = useState(false);
  const [selectedFreeTool, setSelectedFreeTool] = useState<string | null>(null);
  const [activeScreen, setActiveScreen] = useState<AppScreen>('home');

  const showDialog = (nextDialog: AppDialogState) => setDialog(nextDialog);

  const load = async () => {
    setLoading(true);
    try {
      const [serviceData, planData, subscriptionData, pendingCheckoutData, notificationData, paypalConfigData, configData] = await Promise.all([
        api.services(),
        api.plans(),
        api.subscriptions(),
        api.pendingCheckouts(),
        api.notifications(),
        api.paypalConfig(),
        api.config(),
      ]);
      setServices(serviceData);
      setPlans(planData);
      setSubscriptions(subscriptionData);
      setPendingCheckouts(pendingCheckoutData);
      setPaypalConfig(paypalConfigData);
      setAppConfig(configData);
      if (pendingCheckoutData.length > 0) {
        const pending = pendingCheckoutData[0];
        setCheckoutId(pending.id);
        setCheckoutPlanName(pending.plan_name);
        setCheckoutPlanId(pending.plan_id);
        setCheckoutProvider(pending.provider);
        setCheckoutProviderSubscriptionId(pending.provider_checkout_id ?? null);
        setSelectedPlan(null);
      } else {
        setCheckoutId(null);
        setCheckoutPlanName(null);
        setCheckoutPlanId(null);
        setCheckoutProvider(null);
        setCheckoutProviderSubscriptionId(null);
      }
      setNotifications(notificationData);
    } catch {
      setMessage('No se pudo conectar con el backend local. Comprueba que FastAPI está activo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loggedIn) void load();
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return undefined;

    const refreshAfterReturn = () => void load();
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refreshAfterReturn();
    });

    if (typeof window !== 'undefined') window.addEventListener('focus', refreshAfterReturn);
    return () => {
      appStateSubscription.remove();
      if (typeof window !== 'undefined') window.removeEventListener('focus', refreshAfterReturn);
    };
  }, [loggedIn]);

  const login = async () => {
    try {
      const result = await api.login(email, password);
      api.setAccessToken(result.access_token);
      setUser(result.user);
      setMessage('');
      setLoggedIn(true);
    } catch (cause) {
      showDialog({ kind: 'error', title: 'No se pudo iniciar sesión', message: cause instanceof Error ? cause.message : 'Comprueba tus credenciales.' });
    }
  };

  const register = async () => {
    if (password !== passwordConfirmation) {
      showDialog({ kind: 'warning', title: 'Las contraseñas no coinciden', message: 'Escribe la misma contraseña en los dos campos.' });
      return;
    }
    try {
      const result = await api.register(name, email, password, passwordConfirmation);
      api.setAccessToken(result.access_token);
      setUser(result.user);
      setMessage('Usuario creado. Ya puedes utilizar la aplicación sin suscripciones.');
      setLoggedIn(true);
    } catch (cause) {
      showDialog({ kind: 'error', title: 'No se pudo crear la cuenta', message: cause instanceof Error ? cause.message : 'Revisa los datos introducidos.' });
    }
  };

  const requestPasswordRecovery = async () => {
    try {
      const result = await api.forgotPassword(email);
      setMessage(result.message);
      if (result.reset_token) {
        setResetToken(result.reset_token);
        setAuthMode('reset');
        setMessage('Se ha generado un token local de recuperación. Completa el cambio de contraseña.');
      }
    } catch (cause) {
      showDialog({ kind: 'error', title: 'No se pudo iniciar la recuperación', message: cause instanceof Error ? cause.message : 'Inténtalo de nuevo.' });
    }
  };

  const resetPassword = async () => {
    try {
      await api.resetPassword(resetToken, newPassword);
      setPassword('');
      setNewPassword('');
      setAuthMode('login');
      setMessage('Contraseña actualizada. Ya puedes iniciar sesión.');
    } catch (cause) {
      showDialog({ kind: 'error', title: 'No se pudo actualizar la contraseña', message: cause instanceof Error ? cause.message : 'El token puede haber caducado.' });
    }
  };

  const subscribe = (plan: Plan) => {
    if (hasOpenCheckout) {
      setMessage('Ya tienes un checkout pendiente. Retómalo antes de iniciar otra suscripción.');
      return;
    }
    setSelectedPlan(plan);
    setPoliciesAccepted(false);
    setPolicyModalVisible(false);
    setMessage('Completa los datos de facturación antes de continuar.');
  };

  const startCheckout = async () => {
    if (!selectedPlan) return;
    if (billingAddress.trim().length < 5) {
      showDialog({ kind: 'warning', title: 'Dirección no válida', message: 'Introduce una dirección de facturación de al menos 5 caracteres.' });
      return;
    }
    if (!taxId.trim() || !policiesAccepted) {
      showDialog({ kind: 'warning', title: 'Faltan datos', message: 'Introduce la dirección de facturación, un DNI/NIE válido y acepta las políticas para continuar.' });
      return;
    }
    let normalizedTaxId: string;
    try {
      normalizedTaxId = normalizeSpanishPersonId(taxId);
      setTaxId(normalizedTaxId);
    } catch (cause) {
      showDialog({ kind: 'warning', title: 'DNI/NIE no válido', message: cause instanceof Error ? cause.message : 'Comprueba el documento introducido.' });
      return;
    }
    setMessage('Iniciando circuito de suscripción...');
    try {
      const checkout = await api.startSubscriptionCheckout(selectedPlan.id, billingAddress, normalizedTaxId, policiesAccepted);
      setCheckoutId(checkout.checkout_id);
      setCheckoutPlanName(checkout.plan_name ?? selectedPlan.name);
      setCheckoutPlanId(selectedPlan.id);
      setCheckoutProvider(checkout.provider);
      setCheckoutProviderSubscriptionId(checkout.provider_subscription_id ?? null);
      setSelectedPlan(null);
      setPendingCheckouts([{ id: checkout.checkout_id, customer_id: user?.id ?? '', plan_id: selectedPlan.id, plan_name: checkout.plan_name ?? selectedPlan.name, provider: checkout.provider, status: checkout.status, provider_checkout_id: checkout.provider_subscription_id ?? null, approval_url: null, amount_cents: selectedPlan.amount_cents, currency: selectedPlan.currency, interval: selectedPlan.interval }]);
      setMessage(checkout.resumed ? 'Checkout pendiente retomado. Continúa el pago dentro de la aplicación.' : checkout.provider === 'paypal' ? 'Checkout PayPal iniciado. Completa el pago dentro de la aplicación.' : 'Checkout iniciado. Confirma el pago simulado para completar el circuito.');
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('checkout')) {
        await load();
      }
      showDialog({ kind: 'error', title: 'No se pudo iniciar el checkout', message: cause instanceof Error ? cause.message : 'Inténtalo de nuevo.' });
    }
  };

  const hasCurrentSubscription = subscriptions.some((subscription) => ['pending', 'active', 'grace_period', 'suspended'].includes(subscription.status));
  const hasOpenCheckout = pendingCheckouts.length > 0 || Boolean(checkoutId);
  const hasUsableSubscription = subscriptions.some((subscription) => ['active', 'grace_period'].includes(subscription.status));
  const currentSubscription = subscriptions.find((subscription) => ['pending', 'active', 'grace_period', 'suspended'].includes(subscription.status));
  const currentPlan = currentSubscription ? plans.find((plan) => plan.id === currentSubscription.plan_id) : null;
  const drawerPlanLabel = currentPlan?.name ?? 'Sin suscripción';
  const drawerDocumentLimit = currentPlan?.tier === 'premium' ? '250 MB' : '2 MB';
  const premiumScreens: AppScreen[] = ['labor', 'chatbot'];
  const protectedScreens: AppScreen[] = ['appointments', 'documents', 'procedures', 'labor', 'messages', 'notifications', 'chatbot'];
  const ModuleExtension = getClientModule(appConfig?.vertical_module);

  const registerPayPalSubscription = async (providerSubscriptionId: string) => {
    if (!checkoutId) return;
    await api.registerPayPalSubscription(checkoutId, providerSubscriptionId);
    setCheckoutProviderSubscriptionId(providerSubscriptionId);
  };

  const completeCheckout = async (approvedProviderSubscriptionId?: string) => {
    if (!checkoutId) return;
    setMessage(checkoutProvider === 'paypal' ? 'Validando la aprobación de PayPal...' : 'Confirmando checkout local...');
    try {
      if (checkoutProvider === 'paypal' && approvedProviderSubscriptionId && approvedProviderSubscriptionId !== checkoutProviderSubscriptionId) {
        await registerPayPalSubscription(approvedProviderSubscriptionId);
      }
      let completed = false;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < (checkoutProvider === 'paypal' ? 5 : 1); attempt += 1) {
        try {
          await api.completeSubscriptionCheckout(checkoutId, checkoutProvider === 'local');
          completed = true;
          break;
        } catch (cause) {
          lastError = cause;
          const retryable = checkoutProvider === 'paypal' && cause instanceof Error && /APPROVAL_PENDING|APPROVED/.test(cause.message);
          if (!retryable || attempt === 4) throw cause;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      if (!completed && lastError) throw lastError;
      setCheckoutId(null);
      setCheckoutPlanName(null);
      setCheckoutPlanId(null);
      setCheckoutProvider(null);
      setCheckoutProviderSubscriptionId(null);
      setMessage(checkoutProvider === 'local' ? 'Pago simulado confirmado. La suscripción está activa.' : 'Pago confirmado. La suscripción está activa automáticamente.');
      showDialog({ kind: 'success', title: 'Suscripción activada', message: 'El pago se ha confirmado y tu suscripción ya está activa.' });
      await load();
    } catch (cause) {
      showDialog({ kind: 'error', title: 'No se pudo completar el checkout', message: cause instanceof Error ? cause.message : 'Inténtalo de nuevo.' });
    }
  };

  const restartPendingCheckout = async () => {
    if (!checkoutId) return;
    setMessage('Cancelando checkout pendiente...');
    try {
      await api.cancelPendingCheckout(checkoutId);
      setCheckoutId(null);
      setCheckoutPlanName(null);
      setCheckoutPlanId(null);
      setCheckoutProvider(null);
      setCheckoutProviderSubscriptionId(null);
      setPendingCheckouts([]);
      setMessage('Checkout cancelado. Ya puedes iniciar una nueva suscripción.');
      await load();
    } catch (cause) {
      showDialog({ kind: 'error', title: 'No se pudo cancelar el checkout', message: cause instanceof Error ? cause.message : 'Comprueba el estado del pago antes de reiniciarlo.' });
    }
  };

  const cancelSubscription = async (subscriptionId: string) => {
    setMessage('Cancelando suscripción...');
    try {
      await api.cancelSubscription(subscriptionId);
      setMessage('La suscripción seguirá activa hasta el final del periodo, pero no se renovará automáticamente.');
      await load();
    } catch {
      showDialog({ kind: 'error', title: 'No se pudo cancelar', message: 'Inténtalo de nuevo.' });
    }
  };

  const acceptPriceChange = async (subscriptionId: string) => {
    setMessage('Aceptando el nuevo precio y reactivando la renovación automática...');
    try {
      await api.acceptPriceChange(subscriptionId);
      setMessage('Nuevo precio aceptado. La suscripción volverá a renovarse automáticamente.');
      await load();
    } catch {
      showDialog({ kind: 'error', title: 'No se pudo aceptar el precio', message: 'Inténtalo de nuevo.' });
    }
  };

  const logout = () => {
    api.logout();
    setLoggedIn(false);
    setUser(null);
    setServices([]);
    setPlans([]);
    setSubscriptions([]);
    setPendingCheckouts([]);
    setNotifications([]);
    setCheckoutId(null);
    setCheckoutPlanName(null);
    setCheckoutPlanId(null);
    setCheckoutProvider(null);
    setCheckoutProviderSubscriptionId(null);
    setPaypalConfig(null);
    setSelectedPlan(null);
    setBillingAddress('');
    setTaxId('');
    setPoliciesAccepted(false);
    setPolicyModalVisible(false);
    setDrawerVisible(false);
    setFreeToolsVisible(false);
    setSelectedFreeTool(null);
    setActiveScreen('home');
    setAuthMode('login');
    setMessage('Sesión cerrada.');
  };

  const askCancelSubscription = (subscriptionId: string) => {
    showDialog({
      kind: 'warning',
      title: '¿Dejar de renovar?',
      message: 'La suscripción seguirá activa hasta el final del periodo, pero no se renovará automáticamente.',
      confirmLabel: 'No renovar',
      onConfirm: () => cancelSubscription(subscriptionId),
    });
  };

  const askAcceptPriceChange = (subscriptionId: string) => {
    showDialog({
      kind: 'warning',
      title: '¿Aceptar el nuevo precio?',
      message: 'Se actualizará el precio contratado y se reactivará la renovación automática.',
      confirmLabel: 'Aceptar precio',
      onConfirm: () => acceptPriceChange(subscriptionId),
    });
  };

  const askRestartPendingCheckout = () => {
    showDialog({
      kind: 'warning',
      title: '¿Cancelar checkout pendiente?',
      message: 'Se cancelará este intento de suscripción y podrás iniciar otro. El registro quedará conservado como cancelado.',
      confirmLabel: 'Cancelar y empezar de nuevo',
      onConfirm: restartPendingCheckout,
    });
  };

  const profileInitial = user?.name?.trim().charAt(0).toUpperCase() || 'U';
  const openProfile = () => {
    setDrawerVisible(false);
    if (!loggedIn) {
      showDialog({ kind: 'info', title: 'Perfil', message: 'Inicia sesión o crea una cuenta para consultar tu perfil.' });
      return;
    }
    showDialog({ kind: 'info', title: 'Mi perfil', message: `${user?.name || 'Usuario'}\n${user?.email || ''}` });
  };

  const navigate = (screen: AppScreen) => {
    if (protectedScreens.includes(screen) && !hasUsableSubscription) {
      setDrawerVisible(false);
      showDialog({ kind: 'warning', title: 'Suscripción necesaria', message: 'Este servicio requiere una suscripción activa. Accede a “Servicios y planes” para contratarla.' });
      return;
    }
    if (premiumScreens.includes(screen) && currentPlan?.tier !== 'premium') {
      setDrawerVisible(false);
      showDialog({ kind: 'warning', title: 'Plan Premium necesario', message: 'Este servicio está incluido únicamente en el plan Premium.' });
      return;
    }
    setActiveScreen(screen);
    setDrawerVisible(false);
    setSelectedPlan(null);
    setFreeToolsVisible(false);
    setSelectedFreeTool(null);
  };

  const closeFreeTools = () => {
    setFreeToolsVisible(false);
    setSelectedFreeTool(null);
  };

  const renderFreeToolsLauncher = () => loggedIn && appConfig?.vertical_module === 'gestoria' ? <View style={styles.freeToolsLauncher}>
    <View style={styles.freeToolsLauncherCopy}>
      <Text style={styles.freeToolsLauncherTitle}>Herramientas gratuitas</Text>
      <Text style={styles.freeToolsLauncherText}>Abre cada calculadora o el calendario fiscal sin contratar una suscripción.</Text>
    </View>
    <View style={styles.freeToolsButtons}>
      {[
        { id: 'salary', label: 'Sueldo neto', icon: '💶' },
        { id: 'autonomos', label: 'Cuota autónomos', icon: '🧾' },
        { id: 'iva-irpf', label: 'IVA / IRPF', icon: '📊' },
        { id: 'calendario', label: 'Calendario fiscal', icon: '🗓️' },
      ].map((tool) => <Pressable key={tool.id} accessibilityLabel={`Abrir ${tool.label}`} style={styles.freeToolButton} onPress={() => { setSelectedFreeTool(tool.id); setFreeToolsVisible(true); }}><Text style={styles.freeToolIcon}>{tool.icon}</Text><Text style={styles.freeToolButtonText}>{tool.label}</Text></Pressable>)}
    </View>
  </View> : null;

  const renderModule = () => ModuleExtension ? <ModuleExtension accessToken={api.getAccessToken()} activeSection={activeScreen} showFreeTools={freeToolsVisible} selectedFreeTool={selectedFreeTool ?? undefined} onCloseFreeTools={closeFreeTools} ui={{ Text, TextInput, TouchableOpacity, View, Modal, Pressable, ScrollView }} /> : null;

  const renderCatalog = () => <>
    <Text style={styles.sectionTitle}>Servicios disponibles</Text>
    {services.map((service) => <View key={service.id} style={styles.card}>
      <Text style={styles.cardTitle}>{service.name}</Text>
      {service.included && service.image_url ? <Image source={{ uri: service.image_url }} style={styles.serviceImage} accessibilityLabel={service.name} /> : null}
      <Text style={styles.cardText}>{service.description}</Text>
      <Text style={service.included ? styles.included : styles.locked}>{service.minimum_tier === 'free' ? 'Herramienta gratuita' : service.included ? 'Incluido en tu suscripción' : service.minimum_tier === 'premium' ? 'Disponible con Premium' : 'Contrata una suscripción para acceder'}</Text>
      <Pressable style={styles.linkButton} onPress={() => setSelectedService(service)}><Text style={styles.linkButtonText}>Ver detalle y usabilidad</Text></Pressable>
      {service.included && service.attachment_url ? <Pressable onPress={() => void Linking.openURL(service.attachment_url as string)}><Text style={styles.attachmentLink}>Abrir documento adjunto{service.attachment_filename ? ` · ${service.attachment_filename}` : ''}</Text></Pressable> : null}
    </View>)}
    <Text style={styles.sectionTitle}>Planes de suscripción</Text>
    {plans.map((plan) => <View key={plan.id} style={styles.card}>
      <View style={styles.row}><Text style={styles.cardTitle}>{plan.name}</Text><Text style={styles.price}>{(plan.amount_cents / 100).toFixed(2)} {plan.currency}/mes</Text></View>
      <Text style={styles.cardText}>{plan.description}</Text>
      <Pressable disabled={hasCurrentSubscription || hasOpenCheckout || Boolean(selectedPlan)} style={[styles.button, hasCurrentSubscription || hasOpenCheckout || selectedPlan ? styles.buttonDisabled : null]} onPress={() => subscribe(plan)}><Text style={styles.buttonText}>{hasCurrentSubscription ? 'Ya tienes una suscripción vigente' : hasOpenCheckout ? 'Tienes un checkout pendiente' : selectedPlan ? 'Completa los datos de facturación' : 'Iniciar suscripción'}</Text></Pressable>
    </View>)}
  </>;

  const renderSubscriptions = () => <>
    {checkoutId ? <View style={styles.checkoutCard}>
      <Text style={styles.cardTitle}>Checkout pendiente</Text><Text style={styles.cardText}>Plan seleccionado: {checkoutPlanName}</Text>
      {checkoutProvider === 'paypal' ? <>
        <Text style={styles.cardText}>Completa el pago con PayPal dentro de la aplicación usando tu cuenta compradora de pruebas.</Text>
        {paypalConfig?.enabled && paypalConfig.client_id && paypalConfig.environment && checkoutProviderSubscriptionId ? <PayPalSubscriptionCheckout clientId={paypalConfig.client_id} environment={paypalConfig.environment} planId={paypalConfig.plan_ids[checkoutPlanId ?? ''] ?? ''} providerSubscriptionId={checkoutProviderSubscriptionId} onSubscriptionCreated={registerPayPalSubscription} onApproved={(providerSubscriptionId) => completeCheckout(providerSubscriptionId)} onCancelled={restartPendingCheckout} onError={(errorMessage) => showDialog({ kind: 'error', title: 'No se pudo iniciar PayPal', message: errorMessage })} /> : <Text style={styles.cardText}>Preparando el pago seguro de PayPal...</Text>}
      </> : <><Text style={styles.cardText}>Pago simulado integrado: no se introducen ni almacenan datos bancarios. Confirma el pago para completar el circuito de desarrollo.</Text><Pressable style={styles.button} onPress={() => void completeCheckout()}><Text style={styles.buttonText}>Confirmar pago simulado</Text></Pressable></>}
      <Pressable style={styles.cancelButton} onPress={askRestartPendingCheckout}><Text style={styles.cancelButtonText}>Cancelar checkout y empezar de nuevo</Text></Pressable>
    </View> : null}
    {selectedPlan ? <View style={styles.billingCard}>
      <Text style={styles.cardTitle}>Datos de facturación</Text><Text style={styles.cardText}>Necesitamos estos datos antes de iniciar el checkout de {selectedPlan.name}.</Text>
      <TextInput multiline numberOfLines={3} style={[styles.input, styles.multilineInput]} value={billingAddress} onChangeText={setBillingAddress} placeholder="Dirección de facturación" />
      <TextInput autoCapitalize="characters" style={styles.input} value={taxId} onChangeText={(value) => setTaxId(value.toUpperCase())} placeholder="DNI/NIE" />
      <Pressable style={styles.policyLink} onPress={() => setPolicyModalVisible(true)}><Text style={styles.policyLinkText}>{policiesAccepted ? '✓ Políticas aceptadas · Ver de nuevo' : 'Leer y aceptar las políticas'}</Text></Pressable>
      <View style={styles.actionRow}><Pressable style={styles.button} onPress={() => void startCheckout()}><Text style={styles.buttonText}>Continuar al checkout</Text></Pressable><Pressable style={styles.secondaryButton} onPress={() => setSelectedPlan(null)}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable></View>
    </View> : null}
    {notifications.length > 0 ? <><Text style={styles.sectionTitle}>Avisos de suscripción</Text>{notifications.map((notification) => <View key={notification.id} style={styles.noticeCard}><Text style={styles.cardTitle}>{notification.title}</Text><Text style={styles.cardText}>{notification.body}</Text></View>)}</> : null}
    <Text style={styles.sectionTitle}>Mis suscripciones</Text>
    {subscriptions.length === 0 ? <Text style={styles.empty}>Todavía no hay suscripciones.</Text> : subscriptions.map((subscription) => <View key={subscription.id} style={styles.card}>
      <View style={styles.row}><Text style={styles.cardTitle}>{subscription.plan_name}</Text>{Boolean(subscription.auto_renew) ? <Pressable style={styles.cancelButton} onPress={() => askCancelSubscription(subscription.id)}><Text style={styles.cancelButtonText}>No renovar</Text></Pressable> : null}</View>
      <Text style={styles.cardText}>Estado: {subscription.status}</Text><Text style={styles.cardText}>Precio contratado: {(subscription.amount_cents / 100).toFixed(2)} {subscription.currency} / {subscription.interval}</Text>
      {Boolean(subscription.auto_renew) ? <Text style={styles.cardText}>Renovación automática: sí</Text> : <Text style={styles.cardText}>No se renovará automáticamente. Acceso hasta: {subscription.current_period_end}</Text>}
      {(plans.find((plan) => plan.id === subscription.plan_id)?.amount_cents ?? subscription.amount_cents) !== subscription.amount_cents ? <Pressable style={styles.button} onPress={() => askAcceptPriceChange(subscription.id)}><Text style={styles.buttonText}>Aceptar nuevo precio y renovar</Text></Pressable> : null}
    </View>)}
  </>;

  const renderActiveDashboardScreen = () => {
    if (activeScreen === 'home') return <>{renderFreeToolsLauncher()}{renderModule()}</>;
    if (activeScreen === 'catalog') return <>{renderCatalog()}</>;
    if (activeScreen === 'subscriptions') return <>{renderSubscriptions()}</>;
    return <>{renderModule()}</>;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.appHeader}>
        <View style={styles.brandRow}>
          <BrandLogo size={42} />
          <View>
            <Text style={styles.brandName}>WAD Gestoría</Text>
            <Text style={styles.brandTagline}>Gestión clara, en un solo lugar</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel="Abrir menú" style={styles.headerIconButton} onPress={() => setDrawerVisible(true)}>
            <Text style={styles.headerIconText}>☰</Text>
          </Pressable>
          <Pressable accessibilityLabel="Abrir perfil" style={styles.profileButton} onPress={openProfile}>
            <Text style={styles.profileButtonText}>{loggedIn ? profileInitial : '👤'}</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>SUBSCRIPTION SYSTEM · {environment.toUpperCase()}</Text>
        {!loggedIn ? <>
          <View style={styles.topRow}><Text style={styles.title}>Acceso a la aplicación</Text></View>
          <Text style={styles.subtitle}>Puedes crear una cuenta sin contratar ninguna suscripción.</Text>
        </> : activeScreen === 'home' ? <>
          <View style={styles.topRow}><Text style={styles.title}>{`Hola, ${user?.name || 'usuario'}`}</Text></View>
          <Text style={styles.subtitle}>{appConfig?.vertical_display_name ? `${appConfig.vertical_display_name} · ` : ''}{appConfig?.vertical_description || 'Servicios y suscripciones.'}</Text>
        </> : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}
        {!loggedIn ? (
          <View style={styles.card}>
            {authMode === 'login' ? <>
              <Text style={styles.cardTitle}>Iniciar sesión</Text>
              <TextInput autoCapitalize="none" keyboardType="email-address" style={styles.input} value={email} onChangeText={setEmail} placeholder="Correo" />
              <TextInput secureTextEntry style={styles.input} value={password} onChangeText={setPassword} placeholder="Contraseña" />
              <Pressable style={styles.button} onPress={() => void login()}><Text style={styles.buttonText}>Entrar</Text></Pressable>
              <Pressable style={styles.linkButton} onPress={() => setAuthMode('forgot')}><Text style={styles.linkButtonText}>He olvidado mi contraseña</Text></Pressable>
              <Pressable style={styles.linkButton} onPress={() => { setAuthMode('register'); setPassword(''); }}><Text style={styles.linkButtonText}>Crear una cuenta</Text></Pressable>
              <Text style={styles.hint}>Demo: demo@example.test / demo</Text>
            </> : null}
            {authMode === 'register' ? <>
              <Text style={styles.cardTitle}>Crear cuenta</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nombre completo" />
              <TextInput autoCapitalize="none" keyboardType="email-address" style={styles.input} value={email} onChangeText={setEmail} placeholder="Correo" />
              <TextInput secureTextEntry style={styles.input} value={password} onChangeText={setPassword} placeholder="Contraseña (mínimo 8 caracteres)" />
              <TextInput secureTextEntry style={styles.input} value={passwordConfirmation} onChangeText={setPasswordConfirmation} placeholder="Repite la contraseña" />
              <Pressable style={styles.button} onPress={() => void register()}><Text style={styles.buttonText}>Registrarme</Text></Pressable>
              <Pressable style={styles.linkButton} onPress={() => setAuthMode('login')}><Text style={styles.linkButtonText}>Ya tengo una cuenta</Text></Pressable>
            </> : null}
            {authMode === 'forgot' ? <>
              <Text style={styles.cardTitle}>Recuperar contraseña</Text>
              <Text style={styles.cardText}>Te enviaremos instrucciones al correo asociado. En desarrollo se mostrará un token local.</Text>
              <TextInput autoCapitalize="none" keyboardType="email-address" style={styles.input} value={email} onChangeText={setEmail} placeholder="Correo" />
              <Pressable style={styles.button} onPress={() => void requestPasswordRecovery()}><Text style={styles.buttonText}>Solicitar recuperación</Text></Pressable>
              <Pressable style={styles.linkButton} onPress={() => setAuthMode('login')}><Text style={styles.linkButtonText}>Volver al login</Text></Pressable>
            </> : null}
            {authMode === 'reset' ? <>
              <Text style={styles.cardTitle}>Nueva contraseña</Text>
              <TextInput style={styles.input} value={resetToken} onChangeText={setResetToken} placeholder="Token de recuperación" autoCapitalize="none" />
              <TextInput secureTextEntry style={styles.input} value={newPassword} onChangeText={setNewPassword} placeholder="Nueva contraseña (mínimo 8 caracteres)" />
              <Pressable style={styles.button} onPress={() => void resetPassword()}><Text style={styles.buttonText}>Cambiar contraseña</Text></Pressable>
              <Pressable style={styles.linkButton} onPress={() => setAuthMode('login')}><Text style={styles.linkButtonText}>Volver al login</Text></Pressable>
            </> : null}
          </View>
        ) : null}

        {!loggedIn ? null : <>
        <View style={styles.legacyDashboardHidden}>
        {loading ? <ActivityIndicator size="large" color="#1d4ed8" /> : null}

        {checkoutId ? <View style={styles.checkoutCard}>
          <Text style={styles.cardTitle}>Checkout pendiente</Text>
          <Text style={styles.cardText}>Plan seleccionado: {checkoutPlanName}</Text>
          {checkoutProvider === 'paypal' ? <>
            <Text style={styles.cardText}>Completa el pago con PayPal dentro de la aplicación usando tu cuenta compradora de pruebas.</Text>
            {paypalConfig?.enabled && paypalConfig.client_id && paypalConfig.environment && checkoutProviderSubscriptionId ? <PayPalSubscriptionCheckout
              clientId={paypalConfig.client_id}
              environment={paypalConfig.environment}
              planId={paypalConfig.plan_ids[checkoutPlanId ?? ''] ?? ''}
              providerSubscriptionId={checkoutProviderSubscriptionId}
              onSubscriptionCreated={registerPayPalSubscription}
              onApproved={(providerSubscriptionId) => completeCheckout(providerSubscriptionId)}
              onCancelled={restartPendingCheckout}
              onError={(errorMessage) => showDialog({ kind: 'error', title: 'No se pudo iniciar PayPal', message: errorMessage })}
            /> : <Text style={styles.cardText}>Preparando el pago seguro de PayPal...</Text>}
          </> : <>
            <Text style={styles.cardText}>Pago simulado integrado: no se introducen ni almacenan datos bancarios. Confirma el pago para completar el circuito de desarrollo.</Text>
            <Pressable style={styles.button} onPress={() => void completeCheckout()}><Text style={styles.buttonText}>Confirmar pago simulado</Text></Pressable>
          </>}
          <Pressable style={styles.cancelButton} onPress={askRestartPendingCheckout}><Text style={styles.cancelButtonText}>Cancelar checkout y empezar de nuevo</Text></Pressable>
        </View> : null}

        {selectedPlan ? <View style={styles.billingCard}>
          <Text style={styles.cardTitle}>Datos de facturación</Text>
          <Text style={styles.cardText}>Necesitamos estos datos antes de iniciar el checkout de {selectedPlan.name}.</Text>
          <TextInput multiline numberOfLines={3} style={[styles.input, styles.multilineInput]} value={billingAddress} onChangeText={setBillingAddress} placeholder="Dirección de facturación" />
          <TextInput autoCapitalize="characters" style={styles.input} value={taxId} onChangeText={(value) => setTaxId(value.toUpperCase())} placeholder="DNI/NIE" />
          <Pressable style={styles.policyLink} onPress={() => setPolicyModalVisible(true)}>
            <Text style={styles.policyLinkText}>{policiesAccepted ? '✓ Políticas aceptadas · Ver de nuevo' : 'Leer y aceptar las políticas'}</Text>
          </Pressable>
          <View style={styles.actionRow}>
            <Pressable style={styles.button} onPress={() => void startCheckout()}><Text style={styles.buttonText}>Continuar al checkout</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => setSelectedPlan(null)}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable>
          </View>
        </View> : null}

        {notifications.length > 0 ? <>
          <Text style={styles.sectionTitle}>Avisos</Text>
          {notifications.map((notification) => <View key={notification.id} style={styles.noticeCard}>
            <Text style={styles.cardTitle}>{notification.title}</Text>
            <Text style={styles.cardText}>{notification.body}</Text>
          </View>)}
        </> : null}

        {loggedIn && appConfig?.vertical_module === 'gestoria' ? <View style={styles.freeToolsLauncher}>
          <View style={styles.freeToolsLauncherCopy}>
            <Text style={styles.freeToolsLauncherTitle}>Herramientas gratuitas</Text>
            <Text style={styles.freeToolsLauncherText}>Abre cada calculadora o el calendario fiscal sin contratar una suscripción.</Text>
          </View>
          <View style={styles.freeToolsButtons}>
            {[
              { id: 'salary', label: 'Sueldo neto', icon: '💶' },
              { id: 'autonomos', label: 'Cuota autónomos', icon: '🧾' },
              { id: 'iva-irpf', label: 'IVA / IRPF', icon: '📊' },
              { id: 'calendario', label: 'Calendario fiscal', icon: '🗓️' },
            ].map((tool) => <Pressable key={tool.id} accessibilityLabel={`Abrir ${tool.label}`} style={styles.freeToolButton} onPress={() => { setSelectedFreeTool(tool.id); setFreeToolsVisible(true); }}><Text style={styles.freeToolIcon}>{tool.icon}</Text><Text style={styles.freeToolButtonText}>{tool.label}</Text></Pressable>)}
          </View>
        </View> : null}

        {ModuleExtension ? <ModuleExtension accessToken={api.getAccessToken()} showFreeTools={false} selectedFreeTool={undefined} activeSection="hidden" onCloseFreeTools={closeFreeTools} ui={{ Text, TextInput, TouchableOpacity, View, Modal, Pressable, ScrollView }} /> : null}

        <Text style={styles.sectionTitle}>Servicios disponibles</Text>
        {services.map((service) => (
          <View key={service.id} style={styles.card}>
            <Text style={styles.cardTitle}>{service.name}</Text>
            {service.included && service.image_url ? <Image source={{ uri: service.image_url }} style={styles.serviceImage} accessibilityLabel={service.name} /> : null}
            <Text style={styles.cardText}>{service.description}</Text>
            <Text style={service.included ? styles.included : styles.locked}>{service.minimum_tier === 'free' ? 'Herramienta gratuita' : service.included ? 'Incluido en tu suscripción' : service.minimum_tier === 'premium' ? 'Disponible con Premium' : 'Contrata una suscripción para acceder'}</Text>
            <Pressable style={styles.linkButton} onPress={() => setSelectedService(service)}><Text style={styles.linkButtonText}>Ver detalle y usabilidad</Text></Pressable>
            {service.included && service.attachment_url ? <Pressable onPress={() => void Linking.openURL(service.attachment_url as string)}><Text style={styles.attachmentLink}>Abrir documento adjunto{service.attachment_filename ? ` · ${service.attachment_filename}` : ''}</Text></Pressable> : null}
          </View>
        ))}

        <Text style={styles.sectionTitle}>Planes de suscripción</Text>
        {plans.map((plan) => (
          <View key={plan.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{plan.name}</Text>
              <Text style={styles.price}>{(plan.amount_cents / 100).toFixed(2)} {plan.currency}/mes</Text>
            </View>
            <Text style={styles.cardText}>{plan.description}</Text>
            <Pressable disabled={hasCurrentSubscription || hasOpenCheckout || Boolean(selectedPlan)} style={[styles.button, hasCurrentSubscription || hasOpenCheckout || selectedPlan ? styles.buttonDisabled : null]} onPress={() => subscribe(plan)}>
              <Text style={styles.buttonText}>{hasCurrentSubscription ? 'Ya tienes una suscripción vigente' : hasOpenCheckout ? 'Tienes un checkout pendiente' : selectedPlan ? 'Completa los datos de facturación' : 'Iniciar suscripción'}</Text>
            </Pressable>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Mis suscripciones</Text>
        {subscriptions.length === 0 ? (
          <Text style={styles.empty}>Todavía no hay suscripciones.</Text>
        ) : subscriptions.map((subscription) => (
          <View key={subscription.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{subscription.plan_name}</Text>
              {Boolean(subscription.auto_renew) ? <Pressable style={styles.cancelButton} onPress={() => askCancelSubscription(subscription.id)}><Text style={styles.cancelButtonText}>No renovar</Text></Pressable> : null}
            </View>
            <Text style={styles.cardText}>Estado: {subscription.status}</Text>
            <Text style={styles.cardText}>Precio contratado: {(subscription.amount_cents / 100).toFixed(2)} {subscription.currency} / {subscription.interval}</Text>
            {Boolean(subscription.auto_renew) ? <Text style={styles.cardText}>Renovación automática: sí</Text> : <Text style={styles.cardText}>No se renovará automáticamente. Acceso hasta: {subscription.current_period_end}</Text>}
            {(plans.find((plan) => plan.id === subscription.plan_id)?.amount_cents ?? subscription.amount_cents) !== subscription.amount_cents ? <Pressable style={styles.button} onPress={() => askAcceptPriceChange(subscription.id)}><Text style={styles.buttonText}>Aceptar nuevo precio y renovar</Text></Pressable> : null}
          </View>
        ))}
        </View>
        {renderActiveDashboardScreen()}
        </>}
      </ScrollView>
      <Modal transparent visible={drawerVisible} animationType="fade" onRequestClose={() => setDrawerVisible(false)}>
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerVisible(false)} />
          <View style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <View style={styles.brandRow}>
                <BrandLogo size={34} />
                <Text style={styles.drawerTitle}>Menú</Text>
              </View>
              <Pressable accessibilityLabel="Cerrar menú" style={styles.drawerClose} onPress={() => setDrawerVisible(false)}><Text style={styles.drawerCloseText}>×</Text></Pressable>
            </View>
            {loggedIn ? <View style={styles.drawerUserCard}><Text style={styles.drawerUserName}>{user?.name || 'Usuario'}</Text><Text style={styles.drawerUserEmail}>{user?.email}</Text></View> : <Text style={styles.drawerHint}>Accede a tu cuenta para gestionar tus servicios y suscripciones.</Text>}
            <ScrollView style={styles.drawerMenuScroll} contentContainerStyle={styles.drawerMenuContent}>
            <Pressable style={[styles.drawerItem, activeScreen === 'home' ? styles.drawerItemActive : null]} onPress={() => navigate('home')}><Text style={styles.drawerItemText}>Inicio</Text></Pressable>
            <Text style={styles.drawerGroupTitle}>Gestoría</Text>
            <Pressable disabled={!hasUsableSubscription} style={[styles.drawerItem, activeScreen === 'appointments' ? styles.drawerItemActive : null, !hasUsableSubscription ? styles.drawerItemDisabled : null]} onPress={() => navigate('appointments')}><Text style={[styles.drawerItemText, !hasUsableSubscription ? styles.drawerItemTextDisabled : null]}>Citas y visitas{!hasUsableSubscription ? ' · requiere suscripción' : ''}</Text></Pressable>
            <Pressable disabled={!hasUsableSubscription} style={[styles.drawerItem, activeScreen === 'documents' ? styles.drawerItemActive : null, !hasUsableSubscription ? styles.drawerItemDisabled : null]} onPress={() => navigate('documents')}><Text style={[styles.drawerItemText, !hasUsableSubscription ? styles.drawerItemTextDisabled : null]}>Documentos{!hasUsableSubscription ? ' · requiere suscripción' : ''}</Text></Pressable>
            <Pressable disabled={!hasUsableSubscription} style={[styles.drawerItem, activeScreen === 'procedures' ? styles.drawerItemActive : null, !hasUsableSubscription ? styles.drawerItemDisabled : null]} onPress={() => navigate('procedures')}><Text style={[styles.drawerItemText, !hasUsableSubscription ? styles.drawerItemTextDisabled : null]}>Estado de trámites{!hasUsableSubscription ? ' · requiere suscripción' : ''}</Text></Pressable>
            <Pressable disabled={!hasUsableSubscription || currentPlan?.tier !== 'premium'} style={[styles.drawerItem, activeScreen === 'labor' ? styles.drawerItemActive : null, !hasUsableSubscription || currentPlan?.tier !== 'premium' ? styles.drawerItemDisabled : null]} onPress={() => navigate('labor')}><Text style={[styles.drawerItemText, !hasUsableSubscription || currentPlan?.tier !== 'premium' ? styles.drawerItemTextDisabled : null]}>Laboral · Premium</Text></Pressable>
            <Pressable disabled={!hasUsableSubscription} style={[styles.drawerItem, activeScreen === 'messages' ? styles.drawerItemActive : null, !hasUsableSubscription ? styles.drawerItemDisabled : null]} onPress={() => navigate('messages')}><Text style={[styles.drawerItemText, !hasUsableSubscription ? styles.drawerItemTextDisabled : null]}>Mensajes{!hasUsableSubscription ? ' · requiere suscripción' : ''}</Text></Pressable>
            <Pressable disabled={!hasUsableSubscription} style={[styles.drawerItem, activeScreen === 'notifications' ? styles.drawerItemActive : null, !hasUsableSubscription ? styles.drawerItemDisabled : null]} onPress={() => navigate('notifications')}><Text style={[styles.drawerItemText, !hasUsableSubscription ? styles.drawerItemTextDisabled : null]}>Notificaciones{!hasUsableSubscription ? ' · requiere suscripción' : ''}</Text></Pressable>
            <Pressable disabled={!hasUsableSubscription || currentPlan?.tier !== 'premium'} style={[styles.drawerItem, activeScreen === 'chatbot' ? styles.drawerItemActive : null, !hasUsableSubscription || currentPlan?.tier !== 'premium' ? styles.drawerItemDisabled : null]} onPress={() => navigate('chatbot')}><Text style={[styles.drawerItemText, !hasUsableSubscription || currentPlan?.tier !== 'premium' ? styles.drawerItemTextDisabled : null]}>Chatbot IA · Premium</Text></Pressable>
            <Text style={styles.drawerGroupTitle}>Cuenta</Text>
            <Pressable style={[styles.drawerItem, activeScreen === 'catalog' ? styles.drawerItemActive : null]} onPress={() => navigate('catalog')}><Text style={styles.drawerItemText}>Servicios y planes</Text></Pressable>
            <Pressable style={[styles.drawerItem, activeScreen === 'subscriptions' ? styles.drawerItemActive : null]} onPress={() => navigate('subscriptions')}><Text style={styles.drawerItemText}>Mis suscripciones</Text></Pressable>
            <Pressable style={styles.drawerItem} onPress={openProfile}><Text style={styles.drawerItemText}>Mi perfil</Text></Pressable>
            {loggedIn ? <Pressable style={styles.drawerLogout} onPress={logout}><Text style={styles.drawerLogoutText}>Cerrar sesión</Text></Pressable> : null}
            </ScrollView>
            {loggedIn && appConfig?.vertical_module === 'gestoria' ? <View style={styles.drawerModuleInfo}>
              <Text style={styles.drawerModuleName}>{appConfig.vertical_display_name}</Text>
              <Text style={styles.drawerModuleDescription}>{appConfig.vertical_description}</Text>
              <Text style={styles.drawerModuleMeta}>Plan {drawerPlanLabel} · documentos de hasta {drawerDocumentLimit}</Text>
              <Text style={styles.drawerModuleMeta}>Agenda: {appConfig.scheduler_provider === 'local' ? 'local-demo' : appConfig.scheduler_provider ?? 'no configurada'} · ERP: {appConfig.erp_provider ?? 'no configurado'}</Text>
              <Text style={styles.drawerModuleVersion}>Versión {appConfig.vertical_version}</Text>
            </View> : null}
          </View>
        </View>
      </Modal>
      <PolicyModal visible={policyModalVisible} onClose={() => setPolicyModalVisible(false)} onAccept={() => { setPoliciesAccepted(true); setPolicyModalVisible(false); }} />
      <AppDialog
        dialog={selectedService ? {
          kind: selectedService.included ? 'success' : 'info',
          title: selectedService.name,
          message: `${selectedService.details ?? selectedService.description}\n\nCómo se utiliza\n${selectedService.usage ?? 'Consulta las indicaciones que aparezcan al abrir la función.'}`,
          confirmLabel: 'Cerrar',
        } : null}
        onClose={() => setSelectedService(null)}
      />
      <AppDialog dialog={dialog} onClose={() => setDialog(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  appHeader: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#fff', gap: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  brandName: { color: '#0f172a', fontSize: 16, fontWeight: '800' },
  brandTagline: { color: '#64748b', fontSize: 11, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconButton: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff' },
  headerIconText: { color: '#1d4ed8', fontSize: 22, fontWeight: '700' },
  profileButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1d4ed8' },
  profileButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  drawerOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(15, 23, 42, .42)' },
  drawerBackdrop: { flex: 1 },
  drawer: { width: 300, maxWidth: '86%', backgroundColor: '#fff', padding: 20, gap: 8, shadowColor: '#0f172a', shadowOpacity: .25, shadowRadius: 20, shadowOffset: { width: 4, height: 0 }, elevation: 10 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  drawerTitle: { color: '#0f172a', fontSize: 20, fontWeight: '800' },
  drawerClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' },
  drawerCloseText: { color: '#475569', fontSize: 26, lineHeight: 28 },
  drawerUserCard: { backgroundColor: '#eff6ff', borderRadius: 12, padding: 12, marginBottom: 8 },
  drawerUserName: { color: '#1e3a8a', fontSize: 15, fontWeight: '800' },
  drawerUserEmail: { color: '#475569', fontSize: 12, marginTop: 3 },
  drawerHint: { color: '#64748b', fontSize: 13, lineHeight: 19, marginBottom: 8 },
  drawerMenuScroll: { flex: 1 },
  drawerMenuContent: { paddingBottom: 12 },
  drawerGroupTitle: { color: '#94a3b8', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 10, paddingHorizontal: 12, textTransform: 'uppercase' },
  drawerItem: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12 },
  drawerItemActive: { backgroundColor: '#eff6ff' },
  drawerItemDisabled: { opacity: 0.55 },
  drawerItemText: { color: '#1e293b', fontSize: 15, fontWeight: '700' },
  drawerItemTextDisabled: { color: '#94a3b8', fontSize: 13 },
  drawerLogout: { borderColor: '#fecaca', borderWidth: 1, borderRadius: 10, marginTop: 12, padding: 12 },
  drawerLogoutText: { color: '#b91c1c', fontSize: 15, fontWeight: '800' },
  drawerModuleInfo: { borderTopColor: '#e2e8f0', borderTopWidth: 1, gap: 4, marginTop: 10, paddingTop: 12 },
  drawerModuleName: { color: '#0f172a', fontSize: 14, fontWeight: '800' },
  drawerModuleDescription: { color: '#64748b', fontSize: 11, lineHeight: 16 },
  drawerModuleMeta: { color: '#475569', fontSize: 11, lineHeight: 15 },
  drawerModuleVersion: { color: '#94a3b8', fontSize: 10, fontWeight: '700', marginTop: 2 },
  legacyDashboardHidden: { display: 'none' },
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 24, gap: 12 },
  eyebrow: { color: '#1d4ed8', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  title: { color: '#0f172a', fontSize: 32, fontWeight: '800', marginTop: 6 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  subtitle: { color: '#475569', fontSize: 16, marginBottom: 12 },
  message: { backgroundColor: '#dbeafe', color: '#1e3a8a', padding: 12, borderRadius: 10 },
  sectionTitle: { color: '#0f172a', fontSize: 20, fontWeight: '700', marginTop: 18 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', gap: 8 },
  checkoutCard: { backgroundColor: '#eff6ff', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#93c5fd', gap: 8 },
  billingCard: { backgroundColor: '#fff', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#93c5fd', gap: 10 },
  noticeCard: { backgroundColor: '#fffbeb', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#fcd34d', gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cardTitle: { color: '#0f172a', fontSize: 17, fontWeight: '700', flexShrink: 1 },
  cardText: { color: '#475569', fontSize: 14, lineHeight: 20 },
  included: { color: '#15803d', fontSize: 13, fontWeight: '700' },
  locked: { color: '#b45309', fontSize: 13, fontWeight: '700' },
  serviceImage: { width: '100%', height: 150, borderRadius: 10, resizeMode: 'cover' },
  attachmentLink: { color: '#1d4ed8', fontSize: 13, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  multilineInput: { minHeight: 76, textAlignVertical: 'top' },
  policyLink: { borderWidth: 1, borderColor: '#93c5fd', backgroundColor: '#eff6ff', borderRadius: 9, padding: 12 },
  policyLinkText: { color: '#1d4ed8', fontSize: 14, lineHeight: 19, fontWeight: '700' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  secondaryButton: { borderWidth: 1, borderColor: '#94a3b8', borderRadius: 9, paddingVertical: 11, paddingHorizontal: 14 },
  secondaryButtonText: { color: '#475569', fontWeight: '700' },
  hint: { color: '#64748b', fontSize: 13 },
  price: { color: '#1d4ed8', fontWeight: '700' },
  button: { backgroundColor: '#1d4ed8', borderRadius: 9, paddingVertical: 11, paddingHorizontal: 14, alignSelf: 'flex-start' },
  buttonText: { color: '#fff', fontWeight: '700' },
  linkButton: { paddingVertical: 6, alignSelf: 'flex-start' },
  linkButtonText: { color: '#1d4ed8', fontWeight: '700' },
  buttonDisabled: { backgroundColor: '#94a3b8' },
  cancelButton: { borderColor: '#dc2626', borderWidth: 1, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 12 },
  cancelButtonText: { color: '#b91c1c', fontWeight: '700' },
  freeToolsLauncher: { backgroundColor: '#ecfeff', borderColor: '#99f6e4', borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  freeToolsLauncherCopy: { gap: 3 },
  freeToolsLauncherTitle: { color: '#134e4a', fontSize: 16, fontWeight: '800' },
  freeToolsLauncherText: { color: '#475569', fontSize: 13, lineHeight: 18 },
  freeToolsButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freeToolButton: { minWidth: 140, flex: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#0f766e', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  freeToolIcon: { fontSize: 18 },
  freeToolButtonText: { color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  empty: { color: '#64748b' },
});
