import { useMemo } from 'react';
import {
  PayPalProvider,
  PayPalSubscriptionButton,
  type OnApproveDataSubscriptions,
  type OnCancelDataSubscriptions,
  type OnErrorData,
} from '@paypal/react-paypal-js/sdk-v6';

import type { PayPalSubscriptionCheckoutProps } from './PayPalSubscriptionCheckout.types';

export function PayPalSubscriptionCheckout({
  clientId,
  environment,
  planId,
  providerSubscriptionId,
  onSubscriptionCreated,
  onApproved,
  onCancelled,
  onError,
}: PayPalSubscriptionCheckoutProps) {
  const providerKey = useMemo(() => `${environment}:${clientId}`, [clientId, environment]);
  if (!providerSubscriptionId) return null;
  const subscriptionId = providerSubscriptionId;

  return (
    <PayPalProvider
      key={providerKey}
      clientId={clientId}
      environment={environment}
      components={['paypal-subscriptions']}
      pageType="checkout"
    >
      <PayPalSubscriptionButton
        presentationMode="auto"
        createSubscription={() => Promise.resolve({ subscriptionId })}
        onApprove={async (data: OnApproveDataSubscriptions) => {
          await onApproved(data.subscriptionId);
        }}
        onCancel={async (_data: OnCancelDataSubscriptions) => {
          await onCancelled();
        }}
        onError={(data: OnErrorData) => onError(data.message ?? 'PayPal no ha podido completar el pago.')}
      />
    </PayPalProvider>
  );
}
