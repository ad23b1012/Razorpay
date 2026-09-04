import React from 'react';
import { X, Cpu, Tag, Zap, ShieldCheck } from 'lucide-react';
import { productPlaceholder, handleImageError } from '../../utils/productPlaceholder';

export default function ProductSpecsModal({ product, onClose, onAddToCart }) {
  if (!product) return null;

  return (
    <div className="modal-overlay">
      <div style={{
        maxWidth: '560px',
        width: '100%',
        background: '#FFFFFF',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(12, 35, 64, 0.25)',
        border: '1px solid #E2E8F0',
        padding: '32px',
        position: 'relative',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <span className="rzp-badge rzp-badge-dark" style={{ marginBottom: '6px' }}>{product.category}</span>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0C2340' }}>{product.name}</h2>
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

        <img
          src={product.image_url || productPlaceholder(product.name, product.category)}
          alt={product.name}
          onError={(e) => handleImageError(e, product.name, product.category)}
          style={{
            width: '100%',
            height: '200px',
            objectFit: 'cover',
            borderRadius: '8px',
            marginBottom: '16px',
          }}
        />

        <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, marginBottom: '20px' }}>
          {product.description}
        </p>

        {/* Machine-Readable Specs Table */}
        <div style={{
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px',
        }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#0C83FE', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={14} /> Agent-Readable Technical Specifications (UAP Schema)
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
            {Object.entries(product.agent_readable_specs || {}).map(([key, val]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px' }}>
                <span style={{ color: '#64748B', textTransform: 'capitalize' }}>
                  {key.replace(/_/g, ' ')}
                </span>
                <span style={{ color: '#0C2340', fontWeight: 700 }}>
                  {Array.isArray(val) ? val.join(', ') : String(val)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>PRICE</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0C2340' }}>
              ₹{product.price_inr.toLocaleString('en-IN')}
            </div>
          </div>

          <button
            onClick={() => {
              onAddToCart(product);
              onClose();
            }}
            className="btn-rzp-primary"
            style={{ padding: '10px 20px' }}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
