import React, { useState, useEffect } from 'react';
import { Sparkles, ShoppingCart, Info, Check, X, ArrowRight, ShieldCheck, CreditCard, Globe, Headphones, Zap, TrendingUp } from 'lucide-react';
import { productPlaceholder, handleImageError } from '../../utils/productPlaceholder';

export default function StorefrontView({
  products,
  loading,
  onAddToCart,
  onOpenSpecs,
  onOpenAiBuyer,
}) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [audienceIndex, setAudienceIndex] = useState(0);
  const [activeAudienceTab, setActiveAudienceTab] = useState('D2C Brands');

  const audiences = [
    {
      id: 'D2C Brands',
      title: 'D2C Brands',
      tagline: 'Autonomous dynamic bundles & 1-click cart conversions.',
      img: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1000&auto=format&fit=crop&q=80',
    },
    {
      id: 'AI Buyers',
      title: 'AI Buyers',
      tagline: 'Standardized UAP / ACP catalog for machine-to-machine checkout.',
      img: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=1000&auto=format&fit=crop&q=80',
    },
    {
      id: 'SaaS Startups',
      title: 'SaaS Startups',
      tagline: 'Zero-friction recurring billing and international test rails.',
      img: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1000&auto=format&fit=crop&q=80',
    },
  ];

  // Rotating text in hero
  useEffect(() => {
    const timer = setInterval(() => {
      setAudienceIndex((prev) => {
        const next = (prev + 1) % audiences.length;
        setActiveAudienceTab(audiences[next].id);
        return next;
      });
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  const categories = ['All', 'Audio', 'Wearables', 'Power', 'Accessories'];

  const filteredProducts = selectedCategory === 'All'
    ? products
    : products.filter(p => p.category === selectedCategory);

  const activeAudienceObj = audiences.find(a => a.id === activeAudienceTab) || audiences[0];

  return (
    // A flex column with explicit ordering, so the live demo sits near the top
    // where a first-time visitor lands, while the marketing sections below keep
    // their original markup untouched.
    <div style={{
      maxWidth: '1360px',
      margin: '0 auto',
      padding: '32px 32px 100px',
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* 0. Orientation band — what this is, and where to start */}
      <div style={{
        order: 1,
        background: 'linear-gradient(135deg, #0D121F 0%, #1E293B 100%)',
        borderRadius: '20px',
        padding: '28px 32px',
        marginBottom: '32px',
        color: '#FFFFFF',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '24px' }}>
          <div style={{ maxWidth: '620px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <span className="pill-badge pill-blue" style={{ fontSize: '11px', fontWeight: 700 }}>
                RAZORPAY AI CHALLENGE · TRACK 01
              </span>
              <span style={{ fontSize: '12px', color: '#94A3B8' }}>AI Growth &amp; Agentic Commerce</span>
            </div>

            <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25, marginBottom: '10px' }}>
              A storefront an AI agent can buy from — where every rupee it moves is
              bounded, gated and auditable.
            </h2>

            <p style={{ fontSize: '14px', color: '#CBD5E1', lineHeight: 1.6 }}>
              Shop it yourself below, or let the assistant do it. Ask it for
              <strong style={{ color: '#FFFFFF' }}> 40% off</strong> and watch it refuse, then hand the
              decision to a human instead of inventing a discount.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '220px' }}>
            <button
              onClick={() => onOpenAiBuyer()}
              className="rzp-btn-blue"
              style={{ padding: '12px 18px', fontSize: '14px', justifyContent: 'center' }}
            >
              <Sparkles size={15} /> Ask the AI buyer
            </button>
            <button
              onClick={() => document.getElementById('demo-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="rzp-btn-outline"
              style={{ padding: '12px 18px', fontSize: '14px', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.2)' }}
            >
              <ShoppingCart size={15} /> Browse the catalog
            </button>
            <span style={{ fontSize: '11px', color: '#64748B', textAlign: 'center', lineHeight: 1.5 }}>
              Machine buyers: see the <strong style={{ color: '#94A3B8' }}>A2A Protocol</strong> tab
            </span>
          </div>
        </div>
      </div>

      {/* 1. Official Hero Section (Screenshots 1, 2, 3) */}
      <div style={{ order: 3, marginBottom: '40px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#2563EB', marginBottom: '12px', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          Accept Agentic & International Payments
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '24px',
        }}>
          {/* Main Big Headline */}
          <div>
            <h1 style={{
              fontSize: '56px',
              fontWeight: 900,
              color: '#0D121F',
              letterSpacing: '-0.04em',
              lineHeight: 1.08,
            }}>
              Built for Borderless
            </h1>
            <div className="rotating-word-container">
              <div
                key={activeAudienceObj.id}
                className="rotating-word-enter"
                style={{
                  fontSize: '56px',
                  fontWeight: 900,
                  color: '#2563EB',
                  letterSpacing: '-0.04em',
                  lineHeight: 1.08,
                }}
              >
                {activeAudienceObj.title}
              </div>
            </div>
          </div>

          {/* Right Sub-headline & CTA */}
          <div style={{ maxWidth: '420px', paddingTop: '8px' }}>
            <p style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#0D121F',
              lineHeight: 1.4,
              marginBottom: '16px',
              letterSpacing: '-0.02em',
            }}>
              Global Cards, Apple Pay, Google Pay at Lower Fee.
            </p>
            <button
              onClick={() => onOpenAiBuyer()}
              className="rzp-btn-blue"
              style={{ padding: '10px 22px', fontSize: '14px' }}
            >
              Ask the AI buyer <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Interactive Signature Comparison Component (Screenshots 1, 2, 3) */}
      <div style={{
        order: 4,
        background: 'linear-gradient(135deg, #1E293B 0%, #0D121F 100%)',
        borderRadius: '24px',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(13, 18, 31, 0.25)',
        marginBottom: '48px',
        position: 'relative',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.2fr',
          minHeight: '480px',
        }}>
          {/* Left Side: Merchant Lifestyle Showcase */}
          <div style={{
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'flex-end',
            padding: '32px',
          }}>
            <img
              src={activeAudienceObj.img}
              alt="Razorpay Merchant"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: 0.85,
                transition: 'opacity 0.4s ease',
              }}
            />
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(to right, rgba(13, 18, 31, 0.2), rgba(13, 18, 31, 0.95))',
            }} />

            {/* Audience Tabs pill selector inside showcase */}
            <div style={{
              position: 'relative',
              zIndex: 3,
              display: 'flex',
              gap: '6px',
              background: 'rgba(13, 18, 31, 0.75)',
              padding: '4px',
              borderRadius: '8px',
              backdropFilter: 'blur(8px)',
            }}>
              {audiences.map((aud) => (
                <button
                  key={aud.id}
                  onClick={() => {
                    setActiveAudienceTab(aud.id);
                    setAudienceIndex(audiences.findIndex(a => a.id === aud.id));
                  }}
                  style={{
                    background: activeAudienceTab === aud.id ? '#2563EB' : 'transparent',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {aud.title}
                </button>
              ))}
            </div>
          </div>

          {/* Right Side: Comparison Table */}
          <div style={{
            padding: '40px 48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            zIndex: 2,
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '110px 1fr 1fr',
              gap: '14px',
              width: '100%',
              alignItems: 'stretch',
            }}>
              {/* Row Labels */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-around',
                padding: '60px 0 10px',
                color: '#94A3B8',
                fontSize: '13px',
                fontWeight: 500,
              }}>
                <div>Success Rate</div>
                <div>Coverage</div>
                <div>Pricing</div>
                <div>Support</div>
              </div>

              {/* Column 1: Razorpay */}
              <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
              }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0D121F' }}>
                  Razorpay
                </div>

                <div style={{ fontSize: '12px', color: '#334155', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <span style={{ color: '#2563EB', fontWeight: 800 }}>✓</span>
                  <div><strong>90–95%</strong></div>
                </div>

                <div style={{ fontSize: '12px', color: '#334155', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <span style={{ color: '#2563EB', fontWeight: 800 }}>✓</span>
                  <div>135 currencies, global cards, Apple Pay, Google Wallet* & bank transfers</div>
                </div>

                <div style={{ fontSize: '12px', color: '#334155', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <span style={{ color: '#2563EB', fontWeight: 800 }}>✓</span>
                  <div>1% (bank transfers)<br/>Up to 3%* (cards)</div>
                </div>

                <div style={{ fontSize: '12px', color: '#334155', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <span style={{ color: '#2563EB', fontWeight: 800 }}>✓</span>
                  <div>Always-on India-based support</div>
                </div>
              </div>

              {/* Column 2: Others */}
              <div style={{
                background: '#FFF5F5',
                borderRadius: '16px',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
              }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0D121F' }}>
                  Others
                </div>

                <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <span style={{ color: '#DC2626', fontWeight: 800 }}>✕</span>
                  <div>High, with fund-freeze risk</div>
                </div>

                <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <span style={{ color: '#DC2626', fontWeight: 800 }}>✕</span>
                  <div>Limited method coverage; onboarding restricted in some cases</div>
                </div>

                <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <span style={{ color: '#DC2626', fontWeight: 800 }}>✕</span>
                  <div>7–10% with hidden charges</div>
                </div>

                <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <span style={{ color: '#DC2626', fontWeight: 800 }}>✕</span>
                  <div>Ticket loops & long wait times</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{
          position: 'absolute',
          bottom: '12px',
          right: '24px',
          fontSize: '11px',
          color: '#64748B',
          fontStyle: 'italic',
        }}>
          *Powered by Razorpay Rails
        </div>
      </div>

      {/* Brand Trust Marquee */}
      <div className="marquee-wrapper" style={{ order: 5, marginBottom: '64px', padding: '12px 0', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        <div className="marquee-track">
          {['Flipkart', 'Swiggy', 'MakeMyTrip', 'Policybazaar', 'Nykaa', 'CRED', 'Zerodha', 'BookMyShow', 'Zomato', 'Urban Company', 'Flipkart', 'Swiggy', 'MakeMyTrip', 'Policybazaar', 'Nykaa', 'CRED', 'Zerodha', 'BookMyShow'].map((brand, i) => (
            <span key={i} style={{ fontSize: '14px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.04em' }}>
              {brand}
            </span>
          ))}
        </div>
      </div>

      {/* 3. 3-Card Feature Grid (From Screenshot 4) */}
      <div style={{ order: 6, marginBottom: '72px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '32px',
          flexWrap: 'wrap',
          gap: '16px',
        }}>
          <div>
            <h2 style={{
              fontSize: '36px',
              fontWeight: 800,
              color: '#0D121F',
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
            }}>
              Built for India's global businesses.<br />
              Not international middlemen.
            </h2>
          </div>
          <button
            onClick={() => onOpenAiBuyer()}
            className="rzp-btn-blue"
            style={{ padding: '12px 24px', fontSize: '14px' }}
          >
            Accept Agentic Payments
          </button>
        </div>

        {/* 3 Clean Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '24px',
          marginBottom: '20px',
        }}>
          {/* Card 1 */}
          <div className="rzp-clean-card" style={{ padding: '36px 32px' }}>
            <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>
              Receive payments from
            </div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: '#0D121F', letterSpacing: '-0.03em', marginBottom: '24px' }}>
              180+<br />Countries
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{
                background: '#F1F5F9',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#0D121F',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span>🇺🇸</span> USA
              </div>
              <div style={{
                background: '#F1F5F9',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#0D121F',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span>🇬🇧</span> United Kingdom
              </div>
              <div style={{
                background: '#F1F5F9',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#0D121F',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span>🇨🇦</span> Canada
              </div>
            </div>
          </div>

          {/* Card 2: Floating Currency Coins */}
          <div className="rzp-clean-card" style={{ padding: '36px 32px' }}>
            <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>
              Receive payments in
            </div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: '#0D121F', letterSpacing: '-0.03em', marginBottom: '24px' }}>
              135<br />Currencies
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {['S$', 'د.إ', '€', '₣', '£', '$', '₹'].map((curr, idx) => (
                <div
                  key={idx}
                  className="floating-coin"
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: idx === 0 ? '#DCFCE7' : idx === 1 ? '#FEF3C7' : idx === 2 ? '#DBEAFE' : idx === 3 ? '#E0E7FF' : '#F1F5F9',
                    color: '#0D121F',
                    fontSize: '16px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {curr}
                </div>
              ))}
            </div>
          </div>

          {/* Card 3 */}
          <div className="rzp-clean-card" style={{ padding: '36px 32px' }}>
            <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>
              Accept cards, local methods & bank transfers on
            </div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: '#0D121F', letterSpacing: '-0.03em', marginBottom: '24px' }}>
              One<br />Platform
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {['SEPA', 'SWIFT', 'ACH Network', 'UPI Intent'].map((method, idx) => (
                <span
                  key={idx}
                  style={{
                    background: '#F1F5F9',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#334155',
                  }}
                >
                  {method}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Wide Support Bar (From Screenshot 4) */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '20px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          marginBottom: '20px',
        }}>
          <Headphones size={22} color="#059669" />
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#0D121F' }}>
            India-based support. For Indian exporters & D2C merchants.
          </span>
        </div>

        {/* Bottom Soft Blue Banner (From Screenshot 4) */}
        <div style={{
          background: '#EFF6FF',
          border: '1px solid #DBEAFE',
          borderRadius: '16px',
          padding: '32px 40px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
        }}>
          <div>
            <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#0D121F', letterSpacing: '-0.02em', marginBottom: '4px' }}>
              Global brand? Accept UPI from India.
            </h3>
            <p style={{ fontSize: '14px', color: '#475569' }}>
              Collect INR payments from Indian customers without a local entity. Accept payments via cards, netbanking and powerful stack.
            </p>
          </div>
          <button
            onClick={() => onOpenAiBuyer()}
            className="rzp-btn-blue"
            style={{ padding: '10px 20px', fontSize: '14px' }}
          >
            Know More →
          </button>
        </div>
      </div>

      {/* 4. Live Agent-Transactable Product Storefront */}
      <div id="demo-catalog" style={{ order: 2, paddingTop: '8px', marginBottom: '72px', scrollMarginTop: '90px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '32px',
          flexWrap: 'wrap',
          gap: '16px',
        }}>
          <div>
            <span className="pill-badge pill-blue" style={{ marginBottom: '8px' }}>
              DEMO STOREFRONT
            </span>
            <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#0D121F', letterSpacing: '-0.02em' }}>
              Agent-Transactable D2C Catalog
            </h2>
            <p style={{ fontSize: '14px', color: '#64748B' }}>
              Test checkout as a human or instruct the AI Buyer Assistant.
            </p>
          </div>

          {/* Category Filter Pills */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: selectedCategory === cat ? '#0D121F' : '#F1F5F9',
                  color: selectedCategory === cat ? '#FFFFFF' : '#475569',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Cards Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>
            Loading catalog...
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '24px',
          }}>
            {filteredProducts.map((product) => {
              const savingsInr = product.mrp_inr - product.price_inr;
              const savingsPct = Math.round((savingsInr / product.mrp_inr) * 100);

              return (
                <div
                  key={product.id}
                  className="rzp-clean-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    position: 'relative',
                    width: '100%',
                    height: '210px',
                    backgroundColor: '#F8FAFC',
                    overflow: 'hidden',
                  }}>
                    <img
                      src={product.image_url || productPlaceholder(product.name, product.category)}
                      alt={product.name}
                      loading="lazy"
                      onError={(e) => handleImageError(e, product.name, product.category)}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transition: 'transform 0.3s ease',
                      }}
                      onMouseEnter={(e) => e.target.style.transform = 'scale(1.04)'}
                      onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                    />
                    <div style={{ position: 'absolute', top: '12px', left: '12px' }}>
                      <span className="pill-badge pill-dark">{product.category}</span>
                    </div>
                    {savingsPct > 0 && (
                      <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                        <span className="pill-badge pill-mint">{savingsPct}% OFF</span>
                      </div>
                    )}
                  </div>

                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0D121F', marginBottom: '6px' }}>
                      {product.name}
                    </h3>
                    <p style={{
                      fontSize: '13px',
                      color: '#64748B',
                      marginBottom: '16px',
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {product.description}
                    </p>

                    <div style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '8px',
                      marginBottom: '18px',
                      marginTop: 'auto',
                    }}>
                      <span style={{ fontSize: '22px', fontWeight: 800, color: '#0D121F' }}>
                        ₹{product.price_inr.toLocaleString('en-IN')}
                      </span>
                      <span style={{ fontSize: '13px', color: '#94A3B8', textDecoration: 'line-through' }}>
                        ₹{product.mrp_inr.toLocaleString('en-IN')}
                      </span>
                      <span style={{ fontSize: '12px', color: '#059669', fontWeight: 700 }}>
                        Save ₹{savingsInr.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => onAddToCart(product)}
                        className="rzp-btn-blue"
                        style={{ flex: 1, padding: '10px 14px', fontSize: '13px' }}
                      >
                        <ShoppingCart size={15} />
                        Add to Cart
                      </button>

                      <button
                        onClick={() => onOpenSpecs(product)}
                        className="rzp-btn-outline"
                        style={{ padding: '10px 12px' }}
                      >
                        <Info size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
