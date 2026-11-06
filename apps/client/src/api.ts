export type Service = {
  id: string;
  name: string;
  description: string;
  minimum_tier: 'basic' | 'premium';
  included?: boolean;
  subscription_tier?: 'basic' | 'premium' | null;
  image_url?: string | null;
  image_filename?: string | null;
  attachment_url?: string | null;
  attachment_filename?: string | null;
};

export type Plan = {
  id: string;
  name: string;
  description: string;
  amount_cents: number;
  currency: string;
  interval: string;
  tier?: 'basic' | 'premium';
};

export type Subscription = {
  id: string;
  plan_id: string;
  plan_name: string;
  status: string;
  amount_cents: number;
  currency: string;
  interval: string;
  auto_renew: number;
  cancel_at_period_end: number;
  current_period_end: string;
};

export type PendingCheckout = {
  id: string;
  customer_id: string;
  plan_id: string;
  plan_name: string;
  provider: string;
  status: string;
  provider_checkout_id?: string | null;
  approval_url?: string | null;
  amount_cents: number;
  currency: string;
  interval: string;
};

export type PayPalConfig = {
  enabled: boolean;
  environment: 'sandbox' | 'production' | null;
  client_id: string | null;
  plan_ids: Record<string, string>;
};

export type Notification = {
  id: string;
  title: string;
  body: string;
  status: string;
  created_at: string;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

export type AppConfig = {
  environment: string;
  vertical_module: string;
  vertical_display_name: string;
  vertical_description: string;
  local_auth_enabled: boolean;
  auth_provider: string;
  payment_provider: string;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';
let accessToken: string | null = null;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return accessToken ? { ...extra, Authorization: `Bearer ${accessToken}` } : extra;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { headers: headers() });
  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { detail?: unknown } | null;
  const detail = body?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const fieldNames: Record<string, string> = {
      billing_address: 'Dirección de facturación',
      tax_id: 'DNI/NIE',
      policies_accepted: 'Políticas',
      plan_id: 'Plan',
    };
    return detail.map((item) => {
      if (!item || typeof item !== 'object') return String(item);
      const validation = item as { loc?: unknown[]; msg?: unknown };
      const locations = validation.loc?.filter((value) => typeof value === 'string' && value !== 'body') as string[] | undefined;
      const field = locations && locations.length > 0 ? locations[locations.length - 1] : undefined;
      const message = typeof validation.msg === 'string' ? validation.msg : 'Valor no válido';
      return `${field ? `${fieldNames[field] ?? field}: ` : ''}${message}`;
    }).join(' ');
  }
  if (detail && typeof detail === 'object') return JSON.stringify(detail);
  return `API error ${response.status}`;
}

export const api = {
  setAccessToken: (token: string | null) => { accessToken = token; },
  getAccessToken: () => accessToken,
  logout: () => { accessToken = null; },
  config: () => get<AppConfig>('/config'),
  login: async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/auth/local/login`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.json() as Promise<{ access_token: string; user: AuthUser }>;
  },
  register: async (name: string, email: string, password: string, password_confirmation: string) => {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, email, password, password_confirmation }),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.json() as Promise<{ access_token: string; user: AuthUser }>;
  },
  forgotPassword: async (email: string) => {
    const response = await fetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email }),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.json() as Promise<{ message: string; reset_token?: string }>;
  },
  resetPassword: async (token: string, password: string) => {
    const response = await fetch(`${API_URL}/auth/reset-password`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ token, password }),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.json() as Promise<{ message: string }>;
  },
  services: async () => {
    const services = await get<Service[]>('/services/available');
    return services.map((service) => ({
      ...service,
      image_url: service.image_url ? `${API_URL}${service.image_url}` : null,
      attachment_url: service.attachment_url ? `${API_URL}${service.attachment_url}` : null,
    }));
  },
  plans: () => get<Plan[]>('/plans'),
  subscriptions: () => get<Subscription[]>('/subscriptions/me'),
  pendingCheckouts: () => get<PendingCheckout[]>('/checkout/subscriptions/me'),
  notifications: () => get<Notification[]>('/notifications/me'),
  paypalConfig: () => get<PayPalConfig>('/payments/paypal/config'),
  startSubscriptionCheckout: async (plan_id: string, billing_address: string, tax_id: string, policies_accepted: boolean) => {
    const response = await fetch(`${API_URL}/checkout/subscriptions`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ plan_id, billing_address, tax_id, policies_accepted }),
    });
    if (!response.ok) {
      if (response.status === 409) {
        const pending = await get<PendingCheckout[]>('/checkout/subscriptions/me').catch(() => []);
        if (pending.length > 0) {
          return {
            checkout_id: pending[0].id,
            status: pending[0].status,
            provider: pending[0].provider,
            approval_url: pending[0].approval_url ?? null,
            provider_subscription_id: pending[0].provider_checkout_id ?? null,
            plan_name: pending[0].plan_name,
            resumed: true,
          };
        }
      }
      throw new Error(await errorMessage(response));
    }
    return response.json() as Promise<{ checkout_id: string; status: string; provider: string; approval_url: string | null; provider_subscription_id?: string | null; paypal_plan_id?: string; plan_name?: string; resumed?: boolean }>;
  },
  registerPayPalSubscription: async (checkout_id: string, provider_subscription_id: string) => {
    const response = await fetch(`${API_URL}/checkout/subscriptions/${checkout_id}/paypal`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ provider_subscription_id }),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.json() as Promise<{ checkout_id: string; status: string; provider_subscription_id: string }>;
  },
  completeSubscriptionCheckout: async (checkout_id: string, simulatedPayment = false) => {
    const response = await fetch(`${API_URL}/checkout/subscriptions/${checkout_id}/complete`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ confirmed: simulatedPayment }),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.json() as Promise<{ checkout_id: string; subscription_id: string; status: string }>;
  },
  cancelPendingCheckout: async (checkout_id: string) => {
    const response = await fetch(`${API_URL}/checkout/subscriptions/${checkout_id}/cancel`, { method: 'POST', headers: headers() });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.json() as Promise<{ id: string; status: string }>;
  },
  cancelSubscription: async (subscription_id: string) => {
    const response = await fetch(`${API_URL}/subscriptions/${subscription_id}/cancel`, { method: 'POST', headers: headers() });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.json() as Promise<{ id: string; status: string; auto_renew: number; cancel_at_period_end: number; current_period_end: string }>;
  },
  acceptPriceChange: async (subscription_id: string) => {
    const response = await fetch(`${API_URL}/subscriptions/${subscription_id}/accept-price-change`, { method: 'POST', headers: headers() });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.json() as Promise<{ id: string; status: string; auto_renew: boolean; amount_cents: number }>;
  },
};

export const environment = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
