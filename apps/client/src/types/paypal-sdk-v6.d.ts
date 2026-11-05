declare module '@paypal/react-paypal-js/sdk-v6' {
  import type { ComponentType, ReactNode } from 'react';

  export const PayPalProvider: ComponentType<{
    clientId: string;
    environment: 'sandbox' | 'production';
    components: string[];
    pageType?: string;
    children: ReactNode;
  }>;

  export const PayPalSubscriptionButton: ComponentType<{
    createSubscription: () => Promise<{ subscriptionId: string }>;
    presentationMode?: 'auto' | 'popup' | 'modal' | 'payment-handler';
    onApprove: (data: OnApproveDataSubscriptions) => void | Promise<void>;
    onCancel?: (data: OnCancelDataSubscriptions) => void | Promise<void>;
    onError?: (data: OnErrorData) => void;
  }>;

  export type OnApproveDataSubscriptions = { subscriptionId: string; payerId?: string };
  export type OnCancelDataSubscriptions = { subscriptionId?: string };
  export type OnErrorData = { message?: string };
}
