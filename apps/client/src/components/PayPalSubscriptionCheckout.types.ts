export type PayPalSubscriptionCheckoutProps = {
  clientId: string;
  environment: 'sandbox' | 'production';
  planId: string;
  providerSubscriptionId?: string | null;
  onSubscriptionCreated: (providerSubscriptionId: string) => Promise<void>;
  onApproved: (providerSubscriptionId: string) => Promise<void>;
  onCancelled: () => Promise<void>;
  onError: (message: string) => void;
};
