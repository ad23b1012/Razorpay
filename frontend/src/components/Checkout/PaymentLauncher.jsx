import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, CheckCircle2, AlertCircle, X, FlaskConical, Loader2, KeyRound } from 'lucide-react';
import confetti from 'canvas-confetti';
import { verifyPayment, simulatePayment } from '../../services/api';
import { openRazorpayCheckout } from '../../services/razorpayCheckout';

/**
 * Takes an order created by our backend and gets it paid.
 *
 * With live `rzp_test_*` credentials configured, this hands off to Razorpay's
 * own Checkout modal — we never draw a payment form ourselves. Without
 * credentials the backend marks the order `is_mock`, and we show an explicitly
 * labelled simulation panel instead. The simulated payment is still signed and
 * verified server-side with the same HMAC-SHA256 check Razorpay uses, so the
 * verification path is real in both modes.
 */
export default function PaymentLauncher({ orderData, sessionId, customer, onClose, onPaymentSuccess }) {
  const [phase, setPhase] = useState('idle'); // idle | opening | verifying | success | error
  const [paymentId, setPaymentId] = useState('');
  const [verificationDetail, setVerificationDetail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Three distinct situations, and conflating them strands the shopper:
  //  - no credentials at all        -> the labelled simulation rail
  //  - credentials, gateway reached -> real Razorpay Checkout
  //  - credentials, gateway failed  -> a degraded order that Razorpay never saw.
  //    It is flagged is_mock, but /simulate-payment refuses to sign it while live
  //    keys are configured, so offering the simulate button here is a dead end.
  const isDegraded = Boolean(orderData?.gateway_degraded);
  const isSimulation = Boolean(orderData?.is_mock) && !isDegraded;

  const finalize = useCallback(async (payment) => {
    setPhase('verifying');
    const result = await verifyPayment({
      razorpay_order_id: payment.razorpay_order_id,
      razorpay_payment_id: payment.razorpay_payment_id,
      razorpay_signature: payment.razorpay_signature,
      session_id: sessionId,
    });

    setPaymentId(payment.razorpay_payment_id);
    setVerificationDetail(result.verification_detail || '');
    setPhase('success');
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
    setTimeout(() => onPaymentSuccess(result), 2200);
  }, [orderData, sessionId, onPaymentSuccess]);

  // Live mode: hand straight off to Razorpay Checkout.
  useEffect(() => {
    if (!orderData || isSimulation || isDegraded || phase !== 'idle') return;

    let cancelled = false;
    setPhase('opening');

    openRazorpayCheckout({
      orderData,
      customer,
      onDismiss: () => { if (!cancelled) onClose(); },
    })
      .then((response) => { if (!cancelled) return finalize(response); })
      .catch((err) => {
        if (cancelled) return;
        if (err.message === 'Payment cancelled.') return;
        setErrorMsg(err.message);
        setPhase('error');
      });

    return () => { cancelled = true; };
  }, [orderData, isSimulation, isDegraded, phase, customer, finalize, onClose]);

  const handleSimulatedPayment = async () => {
    setErrorMsg('');
    setPhase('opening');
    try {
      const minted = await simulatePayment(orderData.razorpay_order_id);
      await finalize({
        razorpay_order_id: orderData.razorpay_order_id,
        razorpay_payment_id: minted.razorpay_payment_id,
        razorpay_signature: minted.razorpay_signature,
      });
    } catch (err) {
      setErrorMsg(err.message || 'The simulated payment could not be verified.');
      setPhase('error');
    }
  };

  if (!orderData) return null;

  const amountLabel = `₹${Number(orderData.amount_inr).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  return (
    <div className="modal-overlay">
      <div style={{
        width: '100%',
        maxWidth: '480px',
        background: '#FFFFFF',
        color: '#0D121F',
        borderRadius: '16px',
        boxShadow: '0 25px 60px -10px rgba(13, 18, 31, 0.4)',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          background: '#0D121F',
          color: '#FFFFFF',
          padding: '22px 26px',
          borderBottom: `2px solid ${isDegraded ? '#DC2626' : isSimulation ? '#D97706' : '#2563EB'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '-0.01em' }}>
              {isDegraded ? 'Razorpay unreachable' : isSimulation ? 'Simulated Payment Rail' : 'Razorpay Checkout'}
            </span>
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              background: isDegraded ? '#FEE2E2' : isSimulation ? '#FEF3C7' : '#DBEAFE',
              color: isDegraded ? '#991B1B' : isSimulation ? '#92400E' : '#1E40AF',
              padding: '2px 8px',
              borderRadius: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              {isDegraded ? 'Gateway error' : isSimulation ? 'No live keys' : 'Test mode'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px' }}>
            <div style={{ fontSize: '12px', color: '#94A3B8', fontFamily: 'JetBrains Mono, monospace' }}>
              {orderData.razorpay_order_id}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#34D399' }}>{amountLabel}</div>
          </div>
        </div>

        <div style={{ padding: '26px' }}>
          {phase === 'success' ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{
                width: '60px', height: '60px', borderRadius: '50%', background: '#ECFDF5',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
              }}>
                <CheckCircle2 size={38} color="#059669" />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>Payment captured</h3>
              <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '14px', fontFamily: 'JetBrains Mono, monospace' }}>
                {paymentId}
              </p>
              <div style={{
                fontSize: '12px', background: '#F1F5F9', padding: '10px 12px',
                borderRadius: '8px', color: '#334155', textAlign: 'left',
              }}>
                <ShieldCheck size={13} style={{ verticalAlign: '-2px', marginRight: '6px', color: '#059669' }} />
                {verificationDetail || 'Signature verified server-side before capture.'}
              </div>
            </div>
          ) : isDegraded ? (
            <div>
              <div style={{
                display: 'flex', gap: '10px', padding: '12px 14px', background: '#FEF2F2',
                border: '1px solid #FECACA', borderRadius: '10px', marginBottom: '16px',
              }}>
                <AlertCircle size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                <div style={{ fontSize: '12.5px', color: '#991B1B', lineHeight: 1.5 }}>
                  Razorpay could not be reached, so this order was never created there and cannot be
                  paid. Nothing has been charged.
                </div>
              </div>

              <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.6, marginBottom: '16px' }}>
                Usually one of:
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                  <li>a wrong <code>RAZORPAY_KEY_ID</code> or <code>RAZORPAY_KEY_SECRET</code></li>
                  <li>keys from live mode used while the dashboard is in test mode</li>
                  <li>no outbound network access from the backend</li>
                </ul>
                <div style={{ marginTop: '8px' }}>
                  The backend log names the exact gateway error for each retry.
                </div>
              </div>

              <button
                onClick={onClose}
                className="rzp-btn-blue"
                style={{ width: '100%', padding: '14px', fontSize: '15px', borderRadius: '8px' }}
              >
                Close and keep my cart
              </button>
            </div>
          ) : isSimulation ? (
            <div>
              <div style={{
                display: 'flex', gap: '10px', padding: '12px 14px', background: '#FFFBEB',
                border: '1px solid #FDE68A', borderRadius: '10px', marginBottom: '18px',
              }}>
                <KeyRound size={18} color="#B45309" style={{ flexShrink: 0, marginTop: '1px' }} />
                <div style={{ fontSize: '12.5px', color: '#78350F', lineHeight: 1.5 }}>
                  No Razorpay API keys are configured, so this order was emulated locally rather
                  than created on Razorpay. Add <code style={{ fontWeight: 700 }}>RAZORPAY_KEY_ID</code> and{' '}
                  <code style={{ fontWeight: 700 }}>RAZORPAY_KEY_SECRET</code> to <code>.env</code> and
                  the real Razorpay Checkout opens here instead.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
                <FlaskConical size={18} color="#475569" style={{ flexShrink: 0, marginTop: '1px' }} />
                <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                  The button below asks the backend to mint a payment id and its
                  HMAC-SHA256 signature, then sends it through the same
                  <strong> /verify-payment </strong> route a live payment takes. A forged
                  signature is rejected here exactly as it would be in production.
                </div>
              </div>

              {errorMsg && (
                <div style={{
                  marginBottom: '12px', padding: '10px', background: '#FEF2F2', color: '#DC2626',
                  fontSize: '12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  <AlertCircle size={14} /> {errorMsg}
                </div>
              )}

              <button
                disabled={phase === 'opening' || phase === 'verifying'}
                onClick={handleSimulatedPayment}
                className="rzp-btn-blue"
                style={{ width: '100%', padding: '14px', fontSize: '15px', borderRadius: '8px' }}
              >
                {phase === 'verifying'
                  ? 'Verifying signature…'
                  : phase === 'opening'
                    ? 'Signing payment…'
                    : `Simulate a signed payment of ${amountLabel}`}
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Loader2 size={30} className="spin" color="#2563EB" style={{ marginBottom: '14px' }} />
              <p style={{ fontSize: '14px', color: '#334155', fontWeight: 600, marginBottom: '6px' }}>
                {phase === 'verifying' ? 'Verifying the payment signature…' : 'Opening Razorpay Checkout…'}
              </p>
              <p style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.5 }}>
                {phase === 'verifying'
                  ? 'The order is captured only after the signature verifies server-side.'
                  : 'Razorpay’s own checkout window handles the payment. Use a Razorpay test card to pay.'}
              </p>

              {errorMsg && (
                <div style={{
                  marginTop: '14px', padding: '10px', background: '#FEF2F2', color: '#DC2626',
                  fontSize: '12px', borderRadius: '6px', display: 'flex', alignItems: 'center',
                  gap: '6px', textAlign: 'left',
                }}>
                  <AlertCircle size={14} /> {errorMsg}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          aria-label="Close checkout"
          style={{
            position: 'absolute', top: '12px', right: '12px',
            background: 'rgba(255, 255, 255, 0.12)', border: 'none', color: '#FFFFFF',
            borderRadius: '50%', width: '28px', height: '28px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
