import React, { useState } from 'react';
import { ShoppingBag, Sparkles, Headphones, ChevronDown, ArrowRight, ShieldCheck, Zap, Terminal } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, cartCount, openCart, openAiBuyer }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: '#FFFFFF',
      borderBottom: '1px solid #E2E8F0',
      padding: '0 40px',
    }}>
      <div style={{
        maxWidth: '1440px',
        margin: '0 auto',
        height: '72px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Razorpay Brand Logo & Navigation Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '36px' }}>
          {/* Logo */}
          <div
            onClick={() => setActiveTab('storefront')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            <span style={{
              fontSize: '22px',
              fontWeight: 900,
              letterSpacing: '-0.04em',
              color: '#0D121F',
              fontStyle: 'italic',
            }}>
              Razor<span style={{ color: '#2563EB' }}>pay</span>
            </span>
          </div>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '24px', position: 'relative' }}>
            {/* Agentic Stack (Active tab with dropdown) */}
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => setDropdownOpen(true)}
              onMouseLeave={() => setDropdownOpen(false)}
            >
              <button
                onClick={() => setActiveTab('storefront')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: activeTab === 'storefront' ? '#2563EB' : '#334155',
                  padding: '8px 0',
                  cursor: 'pointer',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                Agentic Stack
                {activeTab === 'storefront' && (
                  <span style={{
                    position: 'absolute',
                    bottom: '-16px',
                    left: 0,
                    right: 0,
                    height: '2.5px',
                    backgroundColor: '#2563EB',
                    borderRadius: '2px',
                  }} />
                )}
              </button>

              {/* Dropdown Menu Card (From Screenshot 1) */}
              {dropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: '40px',
                  left: '-12px',
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.12)',
                  padding: '12px 16px',
                  minWidth: '220px',
                  zIndex: 200,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}>
                  <div
                    onClick={() => { setActiveTab('storefront'); setDropdownOpen(false); }}
                    style={{ fontSize: '13px', fontWeight: 600, color: '#0D121F', cursor: 'pointer' }}
                  >
                    Agentic Payments (Storefront)
                  </div>
                  <div
                    onClick={() => { openAiBuyer(); setDropdownOpen(false); }}
                    style={{ fontSize: '13px', fontWeight: 600, color: '#2563EB', cursor: 'pointer' }}
                  >
                    Agent Studio (Conversational Buyer)
                  </div>
                  <div
                    onClick={() => { setActiveTab('growth'); setDropdownOpen(false); }}
                    style={{ fontSize: '13px', fontWeight: 600, color: '#0D121F', cursor: 'pointer' }}
                  >
                    Growth Engine (Revenue Uplift)
                  </div>
                </div>
              )}
            </div>

            {/* Growth Cockpit Tab */}
            <button
              onClick={() => setActiveTab('growth')}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '14px',
                fontWeight: activeTab === 'growth' ? 600 : 500,
                color: activeTab === 'growth' ? '#2563EB' : '#334155',
                padding: '8px 0',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              Growth Engine
              {activeTab === 'growth' && (
                <span style={{
                  position: 'absolute',
                  bottom: '-16px',
                  left: 0,
                  right: 0,
                  height: '2.5px',
                  backgroundColor: '#2563EB',
                  borderRadius: '2px',
                }} />
              )}
            </button>

            {/* Guardrails & Audit Tab */}
            <button
              onClick={() => setActiveTab('safety')}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '14px',
                fontWeight: activeTab === 'safety' ? 600 : 500,
                color: activeTab === 'safety' ? '#2563EB' : '#334155',
                padding: '8px 0',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              Guardrails & Audit
              {activeTab === 'safety' && (
                <span style={{
                  position: 'absolute',
                  bottom: '-16px',
                  left: 0,
                  right: 0,
                  height: '2.5px',
                  backgroundColor: '#2563EB',
                  borderRadius: '2px',
                }} />
              )}
            </button>

            {/* Resilience Lab Tab */}
            <button
              onClick={() => setActiveTab('resilience')}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '14px',
                fontWeight: activeTab === 'resilience' ? 600 : 500,
                color: activeTab === 'resilience' ? '#2563EB' : '#334155',
                padding: '8px 0',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              Resilience Lab
              {activeTab === 'resilience' && (
                <span style={{
                  position: 'absolute',
                  bottom: '-16px',
                  left: 0,
                  right: 0,
                  height: '2.5px',
                  backgroundColor: '#2563EB',
                  borderRadius: '2px',
                }} />
              )}
            </button>

            {/* A2A Protocol Tab */}
            <button
              onClick={() => setActiveTab('protocol')}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '14px',
                fontWeight: activeTab === 'protocol' ? 600 : 500,
                color: activeTab === 'protocol' ? '#2563EB' : '#334155',
                padding: '8px 0',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              A2A Protocol
              {activeTab === 'protocol' && (
                <span style={{
                  position: 'absolute',
                  bottom: '-16px',
                  left: 0,
                  right: 0,
                  height: '2.5px',
                  backgroundColor: '#2563EB',
                  borderRadius: '2px',
                }} />
              )}
            </button>
          </nav>
        </div>

        {/* Right Nav: Headphones, Flag, Login, Sign Up, Cart */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <Headphones size={18} color="#334155" style={{ cursor: 'pointer' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '14px' }}>
            <span>🇮🇳</span>
            <ChevronDown size={14} color="#64748B" />
          </div>

          <button
            onClick={openAiBuyer}
            style={{
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              padding: '7px 14px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#2563EB',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Sparkles size={14} color="#2563EB" />
            AI Buyer
          </button>

          <button
            onClick={openCart}
            className="rzp-btn-blue"
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              borderRadius: '6px',
            }}
          >
            <ShoppingBag size={15} />
            Cart ({cartCount})
          </button>
        </div>
      </div>
    </header>
  );
}
