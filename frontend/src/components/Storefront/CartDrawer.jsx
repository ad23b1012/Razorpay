import React from 'react';
import { X, Trash2, Plus, Minus, ShieldCheck, Sparkles, CreditCard, ArrowRight } from 'lucide-react';

export default function CartDrawer({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  appliedDiscount,
  discountReason,
  onProceedToCheckout,
  isCreatingOrder,
}) {
  if (!isOpen) return null;

  const subtotal = cartItems.reduce((sum, item) => sum + (item.price_inr * item.quantity), 0);
  const discountAmount = appliedDiscount || 0;
  const finalTotal = Math.max(0, subtotal - discountAmount);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
      display: 'flex',
      justifyContent: 'flex-end',
      background: 'rgba(12, 35, 64, 0.45)',
      backdropFilter: 'blur(6px)',
      animation: 'fadeIn 0.2s ease-out',
    }}>
      <div style={{ flex: 1 }} onClick={onClose} />

      <div style={{
        width: '100%',
        maxWidth: '440px',
        height: '100%',
        background: '#FFFFFF',
        borderLeft: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(12, 35, 64, 0.15)',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 24px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0C2340' }}>Order Summary</h2>
            <span className="rzp-badge rzp-badge-blue">{cartItems.length} items</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748B',
              cursor: 'pointer',
              padding: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Items List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          background: '#F8FAFC',
        }}>
          {cartItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#0C2340', marginBottom: '4px' }}>Your cart is empty.</p>
              <p style={{ fontSize: '13px' }}>Add products from the catalog or speak with our AI Assistant!</p>
            </div>
          ) : (
            cartItems.map((item) => (
              <div
                key={item.id}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                <img
                  src={item.image_url}
                  alt={item.name}
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '6px',
                    objectFit: 'cover',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#0C2340',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginBottom: '2px',
                  }}>
                    {item.name}
                  </h4>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0C83FE' }}>
                    ₹{item.price_inr.toLocaleString('en-IN')}
                  </div>
                  {item.is_upsell && (
                    <span className="rzp-badge rzp-badge-mint" style={{ fontSize: '10px', marginTop: '4px' }}>
                      ⚡ AI Bundle Add-on
                    </span>
                  )}
                </div>

                {/* Quantity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                    style={{
                      background: '#F1F5F9',
                      border: '1px solid #CBD5E1',
                      borderRadius: '4px',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Minus size={11} color="#0C2340" />
                  </button>
                  <span style={{ fontSize: '13px', fontWeight: 700, minWidth: '18px', textAlign: 'center', color: '#0C2340' }}>
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                    style={{
                      background: '#F1F5F9',
                      border: '1px solid #CBD5E1',
                      borderRadius: '4px',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={11} color="#0C2340" />
                  </button>
                </div>

                <button
                  onClick={() => onRemoveItem(item.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer Summary */}
        {cartItems.length > 0 && (
          <div style={{
            padding: '24px',
            borderTop: '1px solid #E2E8F0',
            background: '#FFFFFF',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#64748B' }}>
                <span>Subtotal</span>
                <span style={{ color: '#0C2340', fontWeight: 600 }}>₹{subtotal.toLocaleString('en-IN')}</span>
              </div>

              {discountAmount > 0 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '14px',
                  color: '#00A38C',
                  fontWeight: 700,
                }}>
                  <span>AI Agent Subsidy</span>
                  <span>-₹{discountAmount.toLocaleString('en-IN')}</span>
                </div>
              )}

              {discountReason && (
                <div style={{
                  fontSize: '11px',
                  color: '#00A38C',
                  background: '#E6FAF7',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  border: '1px solid rgba(0, 210, 180, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <Sparkles size={12} />
                  {discountReason}
                </div>
              )}

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '18px',
                fontWeight: 800,
                color: '#0C2340',
                borderTop: '1px dashed #E2E8F0',
                paddingTop: '12px',
                marginTop: '4px',
              }}>
                <span>Total Due</span>
                <span style={{ color: '#0C83FE' }}>₹{finalTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Razorpay CTA */}
            <button
              disabled={isCreatingOrder}
              onClick={() => onProceedToCheckout()}
              className="btn-rzp-primary"
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '15px',
                fontWeight: 700,
              }}
            >
              <CreditCard size={18} />
              {isCreatingOrder ? 'Creating Razorpay Order...' : 'Proceed to Razorpay Checkout'}
              <ArrowRight size={18} />
            </button>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              marginTop: '12px',
              fontSize: '11px',
              color: '#64748B',
            }}>
              <ShieldCheck size={14} color="#0C83FE" />
              Secured by Razorpay Standard Test Rails
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
