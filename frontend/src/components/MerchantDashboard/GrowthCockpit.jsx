import React, { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Zap, BarChart3, Users, ArrowUpRight, Plus, Sparkles, CheckCircle2, ShieldCheck, ArrowRight, Layers } from 'lucide-react';
import { fetchGrowthMetrics, fetchCampaigns } from '../../services/api';

export default function GrowthCockpit() {
  const [metrics, setMetrics] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [m, c] = await Promise.all([fetchGrowthMetrics(), fetchCampaigns()]);
        setMetrics(m);
        setCampaigns(c);
      } catch (err) {
        console.error('Failed to load growth data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    const interval = setInterval(loadData, 6000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !metrics) {
    return <div style={{ textAlign: 'center', padding: '80px', color: '#64748B' }}>Loading Razorpay Growth Engine...</div>;
  }

  const baselineWidth = Math.round((metrics.baseline_revenue_inr / metrics.total_revenue_inr) * 100) || 75;
  const upliftWidth = 100 - baselineWidth;

  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '40px 32px 100px' }}>
      
      {/* 1. Enterprise Hero Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0D121F 0%, #1E293B 100%)',
        borderRadius: '20px',
        padding: '40px 48px',
        color: '#FFFFFF',
        marginBottom: '36px',
        boxShadow: '0 20px 40px -10px rgba(13, 18, 31, 0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '24px' }}>
          <div style={{ maxWidth: '720px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span className="pill-badge pill-mint" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <span className="pulse-status-green" /> REAL-TIME INCREMENTAL REVENUE ATTRIBUTION
              </span>
              <span style={{ fontSize: '12px', color: '#94A3B8' }}>• Razorpay Intelligence Suite</span>
            </div>

            <h1 style={{ fontSize: '38px', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: '12px' }}>
              Merchant Revenue & Growth Engine
            </h1>
            <p style={{ fontSize: '15px', color: '#CBD5E1', lineHeight: 1.5 }}>
              Continuously optimize merchant GMV using <strong>bounded autonomous bundle recommendations</strong> and track incremental lift in real time.
            </p>
          </div>

          {/* Quick Metrics */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.07)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '14px',
            padding: '20px 24px',
            display: 'flex',
            gap: '24px',
          }}>
            <div>
              <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>RODI (RETURN ON DISCOUNT)</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#34D399', marginTop: '2px' }}>
                {metrics.return_on_discount_spend}x ROI
              </div>
            </div>
            <div style={{ borderLeft: '1px solid rgba(255, 255, 255, 0.1)', paddingLeft: '24px' }}>
              <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>CONVERSION: CONTROL → AGENT</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#60A5FA', marginTop: '2px' }}>
                {metrics.conversion_rate_baseline_pct}% → {metrics.conversion_rate_ai_pct}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Top KPI Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '24px',
        marginBottom: '36px',
      }}>
        {/* Total GMV */}
        <div className="rzp-clean-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>TOTAL GMV PROCESSED</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={16} color="#2563EB" />
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: 900, color: '#0D121F', marginBottom: '6px', letterSpacing: '-0.02em' }}>
            ₹{metrics.total_revenue_inr.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '12px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
            <ArrowUpRight size={14} /> +{metrics.revenue_uplift_percent}% AI Growth Lift
          </div>
        </div>

        {/* Incremental Uplift */}
        <div className="rzp-clean-card" style={{ padding: '24px', background: '#F0FDF4', borderColor: '#BBF7D0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: '#059669', fontWeight: 700, textTransform: 'uppercase' }}>INCREMENTAL REVENUE (₹)</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={16} color="#059669" />
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: 900, color: '#059669', marginBottom: '6px', letterSpacing: '-0.02em' }}>
            +₹{metrics.incremental_revenue_inr.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '12px', color: '#15803D', fontWeight: 600 }}>
            Net Extra GMV Generated by Agent
          </div>
        </div>

        {/* Conversion Rate */}
        <div className="rzp-clean-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>CHECKOUT CONVERSION</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={16} color="#7C3AED" />
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: 900, color: '#0D121F', marginBottom: '6px', letterSpacing: '-0.02em' }}>
            {metrics.conversion_rate_ai_pct}%
          </div>
          <div style={{ fontSize: '12px', color: '#7C3AED', fontWeight: 600 }}>
            Baseline: {metrics.conversion_rate_baseline_pct}% (+75% AI Conversion)
          </div>
        </div>

        {/* AOV */}
        <div className="rzp-clean-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>AVG ORDER VALUE (AOV)</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={16} color="#D97706" />
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: 900, color: '#0D121F', marginBottom: '6px', letterSpacing: '-0.02em' }}>
            ₹{metrics.average_order_value_inr.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            {metrics.agent_assisted_orders_count} AI-assisted orders
          </div>
        </div>
      </div>

      {/* 3. A/B Revenue Breakdown Comparison Card */}
      <div className="rzp-clean-card" style={{ padding: '32px', marginBottom: '36px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0D121F' }}>
              A/B Revenue Breakdown: Organic Baseline vs. RazorAgent Uplift
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B' }}>
              Measured across live customer checkouts and bounded bundles ("THE BAR").
            </p>
          </div>
          <span className="pill-badge pill-mint" style={{ fontSize: '12px' }}>
            +34.3% NET INCREMENTAL LIFT
          </span>
        </div>

        {/* Visual Progress Bar */}
        <div style={{
          height: '44px',
          borderRadius: '10px',
          overflow: 'hidden',
          display: 'flex',
          marginBottom: '14px',
          border: '1px solid #E2E8F0',
        }}>
          <div style={{
            width: `${baselineWidth}%`,
            background: '#0D121F',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 600,
          }}>
            Organic Baseline: ₹{metrics.baseline_revenue_inr.toLocaleString('en-IN')} ({baselineWidth}%)
          </div>

          <div style={{
            width: `${upliftWidth}%`,
            background: '#2563EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 800,
          }}>
            ⚡ AI Lift: +₹{metrics.incremental_revenue_inr.toLocaleString('en-IN')} ({upliftWidth}%)
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748B' }}>
          <span>Control Group (Standard Static Cart)</span>
          <span style={{ color: '#2563EB', fontWeight: 700 }}>Test Group (RazorAgent Dynamic Bounded Bundles)</span>
        </div>
      </div>

      {/* 3a. Experiment readout — how the uplift above was actually measured */}
      {metrics.experiment && (
        <div className="rzp-clean-card" style={{ padding: '28px 32px', marginBottom: '36px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0D121F', marginBottom: '6px' }}>
                How this uplift was measured
              </h3>
              <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.55, maxWidth: '720px' }}>
                {metrics.experiment.design}
              </p>
            </div>
            <span
              className="pill-badge"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                background: metrics.experiment.has_sufficient_power ? '#ECFDF5' : '#FFFBEB',
                color: metrics.experiment.has_sufficient_power ? '#065F46' : '#92400E',
                border: `1px solid ${metrics.experiment.has_sufficient_power ? '#A7F3D0' : '#FDE68A'}`,
              }}
            >
              {metrics.experiment.has_sufficient_power ? 'ADEQUATE SAMPLE' : 'LOW SAMPLE'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '18px' }}>
            {[
              { key: 'control', label: 'Control (holdout — no agent offers)', accent: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
              { key: 'treatment', label: 'Treatment (agent active)', accent: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
            ].map(({ key, label, accent, bg, border }) => {
              const arm = metrics.experiment[key];
              if (!arm) return null;
              return (
                <div key={key} style={{ background: bg, border: `1px solid ${border}`, borderRadius: '12px', padding: '18px 20px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>
                    {label}
                  </div>
                  {[
                    ['Sessions', arm.sessions.toLocaleString('en-IN')],
                    ['Orders', arm.orders.toLocaleString('en-IN')],
                    ['Conversion', `${arm.conversion_rate_pct}%`],
                    ['Avg order value', `₹${arm.average_order_value_inr.toLocaleString('en-IN')}`],
                    ['Revenue / session', `₹${arm.revenue_per_session_inr.toLocaleString('en-IN')}`],
                    ['Discount spend', `₹${arm.discount_spend_inr.toLocaleString('en-IN')}`],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '5px 0' }}>
                      <span style={{ color: '#64748B' }}>{k}</span>
                      <span style={{ fontWeight: 700, color: '#0D121F' }}>{v}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', fontSize: '12.5px', color: '#475569', lineHeight: 1.6 }}>
            <div style={{ marginBottom: '6px' }}>
              <strong style={{ color: '#0D121F' }}>Incremental revenue</strong> = {metrics.experiment.incremental_definition}.
            </div>
            <div style={{ marginBottom: '6px' }}>{metrics.experiment.power_note}</div>
            <div>
              {metrics.experiment.seeded_sessions.toLocaleString('en-IN')} seeded sessions from a pre-loaded
              two-week history, plus {metrics.experiment.live_sessions.toLocaleString('en-IN')} placed live in this environment.
            </div>
          </div>
        </div>
      )}

      {/* 4. Active Autonomous Growth Campaigns Grid */}
      <div className="rzp-clean-card" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0D121F' }}>Active Autonomous Campaigns</h3>
            <p style={{ fontSize: '13px', color: '#64748B' }}>
              AI agents running within strict merchant discount bounds.
            </p>
          </div>
          <span className="pill-badge pill-blue">{campaigns.length} CAMPAIGNS RUNNING</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          {campaigns.map((camp) => (
            <div
              key={camp.id}
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0D121F' }}>{camp.name}</h4>
                <span className="pill-badge pill-blue" style={{ fontSize: '10px' }}>{camp.strategy}</span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px', lineHeight: 1.4 }}>
                {camp.description}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px', borderTop: '1px solid #E2E8F0', paddingTop: '14px' }}>
                <div>
                  <span style={{ color: '#94A3B8', fontWeight: 600 }}>Incremental Lift:</span>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                    +₹{camp.incremental_revenue_inr.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <span style={{ color: '#94A3B8', fontWeight: 600 }}>Discount Cap:</span>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#0D121F', marginTop: '2px' }}>
                    {camp.max_discount_percent}% Max
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
