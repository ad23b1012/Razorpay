import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Sliders, AlertTriangle, Check, X, Search, RefreshCw, Key, Hash, FileCode, CheckCircle2, ShieldAlert, Cpu, ArrowRight } from 'lucide-react';
import { fetchPolicies, updatePolicies, fetchPendingApprovals, resolvePendingApproval, fetchAuditLogs, verifyAuditChain } from '../../services/api';

export default function SafetyAuditView() {
  const [chainCheck, setChainCheck] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      setChainCheck(await verifyAuditChain());
    } catch (err) {
      setChainCheck({ valid: false, detail: err.message });
    } finally {
      setVerifying(false);
    }
  };

  const [policies, setPolicies] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form states
  const [maxDiscount, setMaxDiscount] = useState(20);
  const [dailyBudget, setDailyBudget] = useState(50000);
  const [approvalThreshold, setApprovalThreshold] = useState(5000);

  const loadAll = async () => {
    try {
      const [p, a, l] = await Promise.all([
        fetchPolicies(),
        fetchPendingApprovals(),
        fetchAuditLogs(50),
      ]);
      setPolicies(p);
      setMaxDiscount(p.max_global_discount_percent || 20);
      setDailyBudget(p.daily_budget_inr || 50000);
      setApprovalThreshold(p.approval_threshold_inr || 5000);
      setApprovals(a);
      setLogs(l);
      if (l.length > 0 && !selectedLog) {
        setSelectedLog(l[0]);
      }
    } catch (err) {
      console.error('Failed to load safety audit data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSavePolicies = async (e) => {
    e.preventDefault();
    setSavingPolicy(true);
    try {
      await updatePolicies({
        max_global_discount_percent: Number(maxDiscount),
        daily_budget_inr: Number(dailyBudget),
        approval_threshold_inr: Number(approvalThreshold),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadAll();
    } catch (err) {
      alert('Failed to save policy: ' + err.message);
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleResolveApproval = async (id, decision) => {
    try {
      await resolvePendingApproval(id, decision);
      await loadAll();
    } catch (err) {
      alert('Error resolving approval: ' + err.message);
    }
  };

  const filteredLogs = filterStatus === 'ALL'
    ? logs
    : logs.filter(l => l.guardrail_status === filterStatus);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '80px', color: '#64748B' }}>Loading Razorpay Enterprise Shield...</div>;
  }

  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '40px 32px 100px', width: '100%', boxSizing: 'border-box' }}>
      
      {/* 1. Enterprise Hero Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0D121F 0%, #1E293B 100%)',
        borderRadius: '20px',
        padding: '36px 40px',
        color: '#FFFFFF',
        marginBottom: '32px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 20px 40px -10px rgba(13, 18, 31, 0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '24px', position: 'relative', zIndex: 2 }}>
          <div style={{ maxWidth: '680px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span className="pill-badge pill-mint" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <span className="pulse-status-green" /> THE BAR: 100% EXPLAINABLE & BOUNDED
              </span>
              <span style={{ fontSize: '12px', color: '#94A3B8' }}>• Enterprise Safety v2.4</span>
            </div>

            <h1 style={{ fontSize: '36px', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: '12px' }}>
              Financial Guardrails & Audit Mesh
            </h1>
            <p style={{ fontSize: '14px', color: '#CBD5E1', lineHeight: 1.5 }}>
              Every monetary action taken by an AI agent is <strong>strictly bounded</strong> by financial policies, <strong>gated</strong> for high-value interventions, and sealed with a <strong>SHA-256 cryptographic audit trail</strong>.
            </p>
          </div>

          {/* Quick Metrics Badge */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.07)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '14px',
            padding: '16px 20px',
            display: 'flex',
            gap: '20px',
          }}>
            <div>
              <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>POLICY STATUS</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#34D399', marginTop: '2px' }}>100% ENFORCED</div>
            </div>
            <div style={{ borderLeft: '1px solid rgba(255, 255, 255, 0.1)', paddingLeft: '20px' }}>
              <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>AUDIT LOGS</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#60A5FA', marginTop: '2px' }}>{logs.length} RECORDED</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Four Active Defense Engines */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div className="rzp-clean-card" style={{ padding: '20px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            <Sliders size={18} color="#2563EB" />
          </div>
          <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0D121F', marginBottom: '4px' }}>Hard Discount Ceiling</h4>
          <p style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.4 }}>
            Hard capped at <strong>{maxDiscount}%</strong>. No AI agent can grant discounts exceeding this limit.
          </p>
        </div>

        <div className="rzp-clean-card" style={{ padding: '20px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            <ShieldCheck size={18} color="#059669" />
          </div>
          <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0D121F', marginBottom: '4px' }}>Margin Floor Armor</h4>
          <p style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.4 }}>
            Protects product base costs. Guarantees positive unit economics on every bundle.
          </p>
        </div>

        <div className="rzp-clean-card" style={{ padding: '20px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            <AlertTriangle size={18} color="#D97706" />
          </div>
          <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0D121F', marginBottom: '4px' }}>Gated Approval Gate</h4>
          <p style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.4 }}>
            Interventions above <strong>₹{Number(approvalThreshold).toLocaleString('en-IN')}</strong> require human authorization.
          </p>
        </div>

        <div className="rzp-clean-card" style={{ padding: '20px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            <Lock size={18} color="#DC2626" />
          </div>
          <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0D121F', marginBottom: '4px' }}>Prompt Injection Shield</h4>
          <p style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.4 }}>
            Zero tolerance for jailbreaks, prompt overrides, or unauthorized parameter overrides.
          </p>
        </div>
      </div>

      {/* 3. Main Console Layout: Policy Controls & Audit Mesh */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 380px) minmax(0, 1fr)', gap: '28px', alignItems: 'start', width: '100%' }}>
        
        {/* Left Column: Bounded Policy Console & Pending Approvals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
          
          {/* Policy Guardrails Card */}
          <div className="rzp-clean-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sliders size={16} color="#2563EB" />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0D121F' }}>Merchant Policy Controls</h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>Live Parameter Configuration</span>
              </div>
            </div>

            <form onSubmit={handleSavePolicies} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Max Discount */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600, color: '#0D121F' }}>Max Global Discount Cap</span>
                  <span style={{ color: '#2563EB', fontWeight: 800, fontSize: '15px' }}>{maxDiscount}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="35"
                  step="1"
                  value={maxDiscount}
                  onChange={(e) => setMaxDiscount(e.target.value)}
                  className="rzp-slider"
                />
                <span style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px', display: 'block' }}>
                  Hard ceiling enforced before any offer reaches the shopper.
                </span>
              </div>

              {/* Daily Budget */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, color: '#0D121F' }}>Daily Campaign Budget</span>
                  <span style={{ color: '#059669', fontWeight: 800, fontSize: '14px' }}>₹{Number(dailyBudget).toLocaleString('en-IN')}</span>
                </div>
                <input
                  type="number"
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    color: '#0D121F',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                />
              </div>

              {/* Approval Threshold */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, color: '#0D121F' }}>Human Approval Gate</span>
                  <span style={{ color: '#D97706', fontWeight: 800, fontSize: '14px' }}>₹{Number(approvalThreshold).toLocaleString('en-IN')}</span>
                </div>
                <input
                  type="number"
                  value={approvalThreshold}
                  onChange={(e) => setApprovalThreshold(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    color: '#0D121F',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={savingPolicy}
                className="rzp-btn-blue"
                style={{ width: '100%', padding: '12px' }}
              >
                {savingPolicy ? 'Updating Policy...' : saveSuccess ? '✓ Policy Enforced!' : 'Save Financial Bounds'}
              </button>
            </form>
          </div>

          {/* Pending Approvals Gate */}
          <div className="rzp-clean-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color="#D97706" />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0D121F' }}>Gated Interventions</h3>
              </div>
              <span className="pill-badge pill-amber" style={{ fontSize: '11px' }}>
                {approvals.filter(a => a.status === 'PENDING').length} PENDING
              </span>
            </div>

            {approvals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 16px', color: '#94A3B8', fontSize: '13px' }}>
                ✓ All agent decisions are currently within automated limits.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {approvals.map((appr) => (
                  <div
                    key={appr.id}
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '10px',
                      padding: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0D121F' }}>{appr.proposed_action}</span>
                      <span
                        className={`pill-badge ${
                          appr.status === 'APPROVED' ? 'pill-mint'
                            : appr.status === 'REJECTED' ? 'pill-red'
                            : 'pill-amber'
                        }`}
                        style={{ fontSize: '10px' }}
                      >
                        {appr.status}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '10px', lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {appr.reasoning}
                    </p>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      marginBottom: '12px',
                      fontSize: '11.5px',
                    }}>
                      {[
                        ['Agent requested', appr.proposed_discount_inr, '#B45309'],
                        ['Approvable ceiling', appr.payload?.approved_ceiling_inr, '#B45309'],
                        ['Agent may grant alone', appr.payload?.auto_cap_inr, '#15803D'],
                        ['Order value', appr.order_amount_inr, '#0D121F'],
                      ].map(([label, value, color]) => (
                        <div key={label} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '7px 9px' }}>
                          <div style={{ color: '#64748B', fontWeight: 600 }}>{label}</div>
                          <div style={{ color, fontWeight: 800, fontSize: '13px', marginTop: '1px' }}>
                            ₹{Number(value || 0).toLocaleString('en-IN')}
                          </div>
                        </div>
                      ))}
                    </div>

                    {appr.status !== 'PENDING' && appr.payload?.resolution_outcome?.order_id && (
                      <div style={{
                        marginBottom: '10px', padding: '8px 10px', borderRadius: '6px',
                        background: '#ECFDF5', border: '1px solid #A7F3D0',
                        fontSize: '11.5px', color: '#065F46', wordBreak: 'break-word',
                      }}>
                        Checkout resumed — order <strong>{appr.payload.resolution_outcome.order_id}</strong> booked
                        for ₹{Number(appr.payload.resolution_outcome.amount_inr || 0).toLocaleString('en-IN')} with
                        ₹{Number(appr.payload.resolution_outcome.discount_applied_inr || 0).toLocaleString('en-IN')} off.
                      </div>
                    )}
                    {appr.status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleResolveApproval(appr.id, 'APPROVED')}
                          className="rzp-btn-blue"
                          style={{ flex: 1, padding: '6px 10px', fontSize: '12px', background: '#059669' }}
                        >
                          <Check size={14} /> Approve
                        </button>
                        <button
                          onClick={() => handleResolveApproval(appr.id, 'REJECTED')}
                          className="rzp-btn-outline"
                          style={{ flex: 1, padding: '6px 10px', fontSize: '12px', color: '#DC2626', borderColor: '#FECACA' }}
                        >
                          <X size={14} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Immutable Audit Trail Table & Deep Trace Inspector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0, width: '100%', overflow: 'hidden' }}>
          
          {/* Chain integrity — the tamper-evidence claim, checkable on demand */}
          <div className="rzp-clean-card" style={{ padding: '20px 24px', minWidth: 0, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0D121F', marginBottom: '4px' }}>
                  Chain integrity
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.5 }}>
                  Each record hashes its own contents plus the hash before it. Recompute the whole
                  chain and see whether anything was altered, reordered, or removed.
                </span>
              </div>
              <button
                onClick={handleVerifyChain}
                disabled={verifying}
                className="rzp-btn-blue"
                style={{ padding: '10px 16px', borderRadius: '8px', fontSize: '13px', whiteSpace: 'nowrap' }}
              >
                {verifying ? 'Recomputing…' : 'Verify chain'}
              </button>
            </div>

            {chainCheck && (
              <div style={{
                marginTop: '14px',
                padding: '12px 14px',
                borderRadius: '10px',
                background: chainCheck.valid ? '#ECFDF5' : '#FEF2F2',
                border: `1px solid ${chainCheck.valid ? '#A7F3D0' : '#FECACA'}`,
              }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  color: chainCheck.valid ? '#065F46' : '#991B1B',
                  marginBottom: '4px',
                }}>
                  {chainCheck.valid ? 'Chain intact' : 'Chain broken'}
                  {typeof chainCheck.records_checked === 'number' && (
                    <span style={{ fontWeight: 600 }}> — {chainCheck.records_checked} records checked</span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: chainCheck.valid ? '#047857' : '#B91C1C', lineHeight: 1.5 }}>
                  {chainCheck.detail}
                </div>
                {chainCheck.head_hash && (
                  <div style={{
                    marginTop: '8px',
                    fontSize: '11px',
                    fontFamily: 'JetBrains Mono, monospace',
                    color: '#475569',
                    wordBreak: 'break-all',
                  }}>
                    HEAD #{chainCheck.head_sequence}: {chainCheck.head_hash}
                  </div>
                )}
                {chainCheck.unchained_legacy_records > 0 && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#92400E' }}>
                    {chainCheck.unchained_legacy_records} record(s) predate chaining and were excluded.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Audit Trail Card */}
          <div className="rzp-clean-card" style={{ padding: '24px', minWidth: 0, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0D121F' }}>Immutable Decision Ledger</h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Real-time cryptographic audit trail of every autonomous agent action
                </span>
              </div>

              {/* Filter Pills */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {['ALL', 'PASSED', 'CAPPED', 'GATED_PENDING_APPROVAL', 'APPROVED_BY_HUMAN', 'BLOCKED', 'FAILED_RECOVERED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: filterStatus === st ? '#2563EB' : '#E2E8F0',
                      background: filterStatus === st ? '#EFF6FF' : '#FFFFFF',
                      color: filterStatus === st ? '#2563EB' : '#64748B',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {st === 'GATED_PENDING_APPROVAL' ? 'GATED' : st === 'APPROVED_BY_HUMAN' ? 'APPROVED' : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Audit Log Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px', minWidth: 0 }}>
              {filteredLogs.map((log) => {
                const isSelected = selectedLog?.id === log.id;
                let badgeStyle = 'pill-blue';
                if (log.guardrail_status === 'PASSED') badgeStyle = 'pill-mint';
                if (log.guardrail_status === 'APPROVED_BY_HUMAN') badgeStyle = 'pill-mint';
                if (log.guardrail_status === 'BLOCKED') badgeStyle = 'pill-red';
                if (log.guardrail_status === 'REJECTED_BY_HUMAN') badgeStyle = 'pill-red';
                if (log.guardrail_status === 'FAILED_RECOVERED') badgeStyle = 'pill-amber';
                if (log.guardrail_status === 'CAPPED') badgeStyle = 'pill-amber';
                if (log.guardrail_status === 'GATED_PENDING_APPROVAL') badgeStyle = 'pill-amber';
                if (log.guardrail_status === 'ESCALATED') badgeStyle = 'pill-amber';

                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '10px',
                      background: isSelected ? '#EFF6FF' : '#F8FAFC',
                      border: '1px solid',
                      borderColor: isSelected ? '#2563EB' : '#E2E8F0',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0D121F' }}>
                          {log.action_type}
                        </span>
                        <span className={`pill-badge ${badgeStyle}`} style={{ fontSize: '10px' }}>
                          {log.guardrail_status}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500, flexShrink: 0 }}>
                        {new Date(log.created_at).toLocaleTimeString()}
                      </span>
                    </div>

                    <p style={{
                      fontSize: '12px',
                      color: '#475569',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                      lineHeight: 1.4,
                    }}>
                      {log.reasoning}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Deep Trace Inspector (Terminal Style) */}
          {selectedLog && (
            <div className="rzp-terminal-window" style={{ minWidth: 0, width: '100%' }}>
              <div className="rzp-terminal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10B981', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: '6px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    EXPLAINABILITY TRACE // {selectedLog.id}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#60A5FA', fontWeight: 600, flexShrink: 0 }}>
                  Actor: {selectedLog.actor}
                </span>
              </div>

              <div className="rzp-terminal-body" style={{ minWidth: 0, padding: '16px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <span style={{ color: '#60A5FA', fontWeight: 700 }}>&gt; DECISION_REASONING:</span>
                  <div style={{ color: '#E2E8F0', marginTop: '6px', fontSize: '12px', lineHeight: 1.5, wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                    {selectedLog.reasoning}
                  </div>
                </div>

                {/* Every bound the engine weighed, and which one actually bound. */}
                {selectedLog.context_data?.constraints_evaluated?.length > 0 && (
                  <div style={{ marginBottom: '12px', borderTop: '1px solid #1E293B', paddingTop: '10px' }}>
                    <span style={{ color: '#60A5FA', fontWeight: 700 }}>&gt; BOUNDS_EVALUATED:</span>
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {selectedLog.context_data.constraints_evaluated.map((c) => {
                        const isBinding = c.name === selectedLog.decision_payload?.binding_constraint;
                        return (
                          <div key={c.name} style={{
                            display: 'flex', justifyContent: 'space-between', gap: '10px',
                            fontSize: '11.5px', flexWrap: 'wrap',
                            color: isBinding ? '#FBBF24' : '#94A3B8',
                            fontWeight: isBinding ? 700 : 500,
                          }}>
                            <span style={{ wordBreak: 'break-word' }}>
                              {isBinding ? '▸ ' : '  '}{c.name}
                              <span style={{ color: '#64748B', fontWeight: 400 }}> — {c.detail}</span>
                            </span>
                            <span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                              ₹{Number(c.cap_inr).toLocaleString('en-IN')} ({c.cap_percent}%)
                              {c.kind === 'hard' ? ' · hard' : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748B' }}>
                      The tightest bound wins. A bound marked <strong>hard</strong> cannot be lifted even by an approval.
                    </div>
                  </div>
                )}

                <div style={{ borderTop: '1px solid #1E293B', paddingTop: '10px', fontSize: '11px', color: '#94A3B8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                    <Hash size={13} color="#60A5FA" />
                    <span>CHAIN LINK{selectedLog.sequence ? ` #${selectedLog.sequence}` : ''}:</span>
                  </div>
                  {selectedLog.verification_hash ? (
                    <>
                      <div style={{ marginBottom: '4px', wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
                        <span style={{ color: '#64748B' }}>this: </span>
                        <span style={{ color: '#34D399', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                          {selectedLog.verification_hash}
                        </span>
                      </div>
                      {selectedLog.previous_hash && (
                        <div style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
                          <span style={{ color: '#64748B' }}>prev: </span>
                          <span style={{ color: '#60A5FA', fontFamily: 'var(--font-mono)' }}>
                            {selectedLog.previous_hash}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <span style={{ color: '#FBBF24' }}>
                      This record predates hash chaining and carries no digest.
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
