import React from 'react';
import { Sparkles, Check, X, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

export default function DynamicUpsellModal({
  offer,
  onAccept,
  onDecline,
}) {
  if (!offer || !offer.offer_available) return null;

  return (
    <div className="modal-overlay">
      <div style={{
        maxWidth: '500px',
        width: '100%',
        background: '#FFFFFF',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(12, 35, 64, 0.25)',
        border: '1px solid #E2E8F0',
        padding: '32px',
        position: 'relative',
      }}>
        {/* Badge Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span className="rzp-badge rzp-badge-mint">
            <Zap size={13} /> AUTONOMOUS GROWTH OFFER
          </span>
          <span className="rzp-badge rzp-badge-blue">
            {offer.discount_percent}% DISCOUNT
          </span>
        </div>

        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0C2340', marginBottom: '8px', lineHeight: 1.25 }}>
          {offer.offer_title || '⚡ Exclusive Bundle Offer'}
        </h2>
        <p style={{ fontSize: '14px', color: '#475569', marginBottom: '20px', lineHeight: 1.5 }}>
          {offer.offer_description}
        </p>

        {/* Product Box */}
        <div style={{
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '18px',
        }}>
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0C2340', marginBottom: '2px' }}>
              {offer.recommended_product_name}
            </h4>
            <div style={{ fontSize: '13px', color: '#64748B' }}>
              Special Add-on Pricing
            </div>
          </div>

          <div style={{
            background: '#E6FAF7',
            border: '1px solid rgba(0, 210, 180, 0.3)',
            borderRadius: '6px',
            padding: '6px 12px',
            textAlign: 'right',
          }}>
            <div style={{ fontSize: '10px', color: '#00A38C', fontWeight: 700 }}>YOU SAVE</div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#00A38C' }}>₹{offer.discount_amount_inr.toFixed(0)}</div>
          </div>
        </div>

        {/* Explainability Note ("THE BAR") */}
        <div style={{
          background: '#EBF5FF',
          border: '1px solid rgba(12, 131, 254, 0.2)',
          borderRadius: '6px',
          padding: '10px 12px',
          marginBottom: '24px',
          fontSize: '12px',
          color: '#072654',
          lineHeight: 1.5,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0C83FE', fontWeight: 700, marginBottom: '2px' }}>
            <Sparkles size={13} />
            Agent rationale:
          </div>
          {offer.reasoning}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onDecline}
            className="btn-rzp-secondary"
            style={{ flex: 1, padding: '12px' }}
          >
            No, Thanks
          </button>

          <button
            onClick={() => onAccept(offer)}
            className="btn-rzp-primary"
            style={{ flex: 2, padding: '12px' }}
          >
            <Check size={16} />
            Accept & Add to Order
          </button>
        </div>
      </div>
    </div>
  );
}
