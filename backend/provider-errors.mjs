// Public-safe diagnostics only. Never return/log a provider message, API key,
// full Stripe object, request headers, body, card data or stack trace.
export function safeProviderError(error) {
  const errors={
    StripeAuthenticationError:'stripe_key_rejected',
    StripePermissionError:'stripe_permission_denied',
    StripeInvalidRequestError:'stripe_request_rejected',
    StripeRateLimitError:'stripe_rate_limited',
    StripeConnectionError:'stripe_connection_failed',
    StripeAPIError:'stripe_temporarily_unavailable'
  };
  const code=Object.hasOwn(errors,error?.type)?errors[error.type]:'service_unavailable';
  const body={error:code};
  if(/^req_[A-Za-z0-9]+$/.test(error?.requestId||''))body.stripe_request_id=error.requestId;
  return {body,status:503};
}
