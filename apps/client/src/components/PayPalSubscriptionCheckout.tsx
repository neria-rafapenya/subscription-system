import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { PayPalSubscriptionCheckoutProps } from './PayPalSubscriptionCheckout.types';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[character] ?? character));
}

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
  const html = useMemo(() => {
    const sdkHost = environment === 'sandbox' ? 'www.sandbox.paypal.com' : 'www.paypal.com';
    return `<!doctype html>
<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>body{font-family:system-ui;margin:0;padding:8px;background:#fff}#paypal-button-container{min-height:48px}</style>
</head><body><paypal-button id="paypal-button" type="subscribe" class="paypal-gold"></paypal-button>
<script src="https://${sdkHost}/web-sdk/v6/core"></script>
<script>
  function notify(type, data) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, data: data || {} }));
  }
  (async function() {
    try {
      const sdkInstance = await window.paypal.createInstance({
        clientId: '${escapeHtml(clientId)}',
        components: ['paypal-subscriptions'],
        pageType: 'checkout'
      });
      const subscriptionSession = sdkInstance.createPayPalSubscriptionSession({
        onApprove: function(data) { notify('approved', { subscriptionId: data.subscriptionId }); },
        onCancel: function(data) { notify('cancelled', data); },
        onError: function(error) { notify('error', { message: String(error.message || error) }); }
      });
      document.getElementById('paypal-button').addEventListener('click', function() {
        subscriptionSession.start(
          { presentationMode: 'modal' },
          Promise.resolve({ subscriptionId: '${escapeHtml(providerSubscriptionId ?? '')}' })
        );
      });
    } catch (error) {
      notify('error', { message: String(error.message || error) });
    }
  })();
</script></body></html>`;
  }, [clientId, environment, planId, providerSubscriptionId]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string; data?: { subscriptionId?: string; message?: string } };
      if (message.type === 'created' && message.data?.subscriptionId) void onSubscriptionCreated(message.data.subscriptionId);
      if (message.type === 'approved' && message.data?.subscriptionId) void onApproved(message.data.subscriptionId);
      if (message.type === 'cancelled') void onCancelled();
      if (message.type === 'error') onError(message.data?.message ?? 'PayPal no ha podido completar el pago.');
    } catch {
      onError('No se ha podido leer la respuesta de PayPal.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pago seguro con PayPal</Text>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 96, marginVertical: 8 },
  title: { color: '#172554', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  webview: { backgroundColor: 'transparent', height: 80 },
});
