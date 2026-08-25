import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { fetchApproval } from '../../services/api';

const POLL_INTERVAL_MS = 2500;

/**
 * Shown when a discount trips the human approval gate.
 *
 * Nothing has been charged and no Razorpay order exists at this point. The
 * shopper waits here while a merchant rules in the Safety & Audit console; on
 * approval the original checkout resumes with the authorized amount, and on
 * rejection the shopper can continue at the discount the agent could grant on
 * its own authority.
 */
export default function ApprovalPendingModal({ gatedOrder, onApproved, onRejected, onClose }) {
  const [status, setStatus] = useState('PENDING');
  const [elapsed, setElapsed] = useState(0);
  const onApprovedRef = useRef(onApproved);
  onApprovedRef.current = onApproved;

  useEffect(() => {
    if (!gatedOrder?.approval_id) return;

    let cancelled = false;
    let settled = false;
    const startedAt = Date.now();

    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);

    const poll = async () => {
      if (cancelled || settled) return;
      try {
        const approval = await fetchApproval(gatedOrder.approval_id);
        if (cancelled || approval.status === 'PENDING') return;

        settled = true;
        setStatus(approval.status);

        if (approval.status === 'APPROVED') {
          const outcome = approval.payload?.resolution_outcome || {};
          setTimeout(() => onApprovedRef.current(outcome), 900);
        }
      } catch {
        // Transient failure; the next tick retries.
      }
    };

    // Check straight away rather than making the shopper wait out a full interval.
    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);

    // Browsers throttle timers in background tabs to roughly once a minute, so a
    // shopper who tabs away while waiting would sit on a stale screen long after
    // the merchant decided. Re-checking on focus closes that gap.
    const onVisible = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [gatedOrder]);

  if (!gatedOrder) return null;

  const rupees = (value) =>
    Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const requested = gatedOrder.requested_discount_inr || 0;
  const autoOk = gatedOrder.auto_applicable_discount_inr || 0;

  return (
    <div className="modal-overlay">
      <div style={{
        width: '100%', maxWidth: '520px', background: '#FFFFFF', color: '#0D121F',
        borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden',
        boxShadow: '0 25px 60px -10px rgba(13, 18, 31, 0.4)',
      }}>
        <div style={{ background: '#0D121F', padding: '22px 26px', borderBottom: '2px solid #D97706' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={20} color="#FBBF24" />
            <div>
              <div style={{ color: '#FFFFFF', fontSize: '16px', fontWeight: 700 }}>
                Held for merchant approval
              </div>
              <div style={{ color: '#94A3B8', fontSize: '12px', marginTop: '2px' }}>
                Nothing has been charged — no order exists yet.
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px 26px' }}>
          <p style={{ fontSize: '13.5px', color: '#334155', lineHeight: 1.6, marginBottom: '18px' }}>
            {gatedOrder.explainability_note}
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px',
          }}>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Agent requested
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#B45309', marginTop: '4px' }}>
                ₹{rupees(requested)}
              </div>
            </div>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Agent may grant alone
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#15803D', marginTop: '4px' }}>
                ₹{rupees(autoOk)}
              </div>
            </div>
          </div>

          {status === 'PENDING' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px',
              background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', marginBottom: '16px',
            }}>
              <Loader2 size={18} className="spin" color="#2563EB" />
              <div style={{ fontSize: '12.5px', color: '#475569' }}>
                Waiting on a merchant decision in the Safety &amp; Audit console… ({elapsed}s)
              </div>
            </div>
          )}

          {status === 'APPROVED' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px',
              background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '10px', marginBottom: '16px',
            }}>
              <CheckCircle2 size={18} color="#059669" />
              <div style={{ fontSize: '12.5px', color: '#065F46', fontWeight: 600 }}>
                Approved. Resuming your checkout…
              </div>
            </div>
          )}

          {status === 'REJECTED' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px',
              background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', marginBottom: '16px',
            }}>
              <XCircle size={18} color="#DC2626" />
              <div style={{ fontSize: '12.5px', color: '#991B1B' }}>
                The merchant declined this discount.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #CBD5E1',
                background: '#FFFFFF', color: '#475569', fontWeight: 600, fontSize: '13.5px', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            {status !== 'APPROVED' && (
              <button
                onClick={() => onRejected(autoOk)}
                className="rzp-btn-blue"
                style={{ flex: 2, padding: '12px', borderRadius: '8px', fontSize: '13.5px' }}
              >
                Continue at ₹{rupees(autoOk)} off
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
