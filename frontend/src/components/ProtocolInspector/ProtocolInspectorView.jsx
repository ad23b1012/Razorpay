import React, { useState, useEffect } from 'react';
import { Terminal, Send, CheckCircle2, Copy, Play, ArrowRight, Sparkles, Cpu, Layers, Code2, Globe, Check } from 'lucide-react';
import { fetchAgentCatalog, negotiateA2AProtocol, fetchAgentDiscoveryDocument, runAgentPurchaseChallenge, settleAndRedeem } from '../../services/api';

export default function ProtocolInspectorView() {
  const [catalogJson, setCatalogJson] = useState(null);
  const [discoveryJson, setDiscoveryJson] = useState(null);
  const [loadingCat, setLoadingCat] = useState(true);
  const [selectedEndpoint, setSelectedEndpoint] = useState('discovery');
  const [copied, setCopied] = useState(false);

  const [negotiatePayload, setNegotiatePayload] = useState({
    item_ids: ['prod_aura_anc_pro', 'prod_aura_dock_3in1'],
    target_budget_inr: 9500,
    buyer_agent_id: 'chatgpt_shopping_agent_04',
  });
  const [negotiateResponse, setNegotiateResponse] = useState(null);

  // The machine purchase flow: 402 challenge, then settle-and-redeem.
  const CHALLENGE_PRODUCT = 'prod_gan_65w_charger';
  const [challenge, setChallenge] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');

  const handleRequestChallenge = async () => {
    setPurchaseBusy(true);
    setPurchaseError('');
    setReceipt(null);
    try {
      const { status, body } = await runAgentPurchaseChallenge(CHALLENGE_PRODUCT);
      if (status === 402) setChallenge(body);
      else setPurchaseError(`Expected 402, got ${status}: ${body.message || body.detail || ''}`);
    } catch (err) {
      setPurchaseError(err.message);
    } finally {
      setPurchaseBusy(false);
    }
  };

  const handleSettle = async () => {
    setPurchaseBusy(true);
    setPurchaseError('');
    try {
      setReceipt(await settleAndRedeem(challenge, CHALLENGE_PRODUCT));
    } catch (err) {
      setPurchaseError(err.message);
    } finally {
      setPurchaseBusy(false);
    }
  };

  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    async function loadSchemas() {
      try {
        const [cat, doc] = await Promise.all([fetchAgentCatalog(), fetchAgentDiscoveryDocument()]);
        setCatalogJson(cat);
        setDiscoveryJson(doc);
      } catch (err) {
        console.error('Failed to load agent protocol schemas:', err);
      } finally {
        setLoadingCat(false);
      }
    }
    loadSchemas();
  }, []);

  const handleRunNegotiation = async () => {
    setIsExecuting(true);
    try {
      const res = await negotiateA2AProtocol(
        negotiatePayload.item_ids,
        negotiatePayload.target_budget_inr,
        negotiatePayload.buyer_agent_id
      );
      setNegotiateResponse(res);
    } catch (err) {
      alert('Error during A2A negotiation: ' + err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '40px 32px 100px', width: '100%', boxSizing: 'border-box' }}>
      
      {/* 1. Enterprise Hero Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0D121F 0%, #1E293B 100%)',
        borderRadius: '20px',
        padding: '36px 40px',
        color: '#FFFFFF',
        marginBottom: '32px',
        boxShadow: '0 20px 40px -10px rgba(13, 18, 31, 0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '24px' }}>
          <div style={{ maxWidth: '720px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span className="pill-badge pill-blue" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <Cpu size={13} /> AGENT-TO-AGENT COMMERCE SPECIFICATION
              </span>
              <span style={{ fontSize: '12px', color: '#94A3B8' }}>• ACP / AP2 / x402-ALIGNED — SEE /.well-known/agent-commerce.json</span>
            </div>

            <h1 style={{ fontSize: '36px', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: '12px' }}>
              Agentic Protocol Developer Studio
            </h1>
            <p style={{ fontSize: '14px', color: '#CBD5E1', lineHeight: 1.5 }}>
              Make the merchant <strong>transactable by external AI buyers end to end</strong>: a published discovery document, a machine-readable catalog, bounded negotiation that files anything oversized with a human, and signature-verified settlement on Razorpay.
            </p>
          </div>

          {/* Protocol Badges */}
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
              <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>PROTOCOL</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#60A5FA', marginTop: '2px' }}>
                {discoveryJson?.protocol || catalogJson?.protocol || '…'}
              </div>
            </div>
            <div style={{ borderLeft: '1px solid rgba(255, 255, 255, 0.1)', paddingLeft: '20px' }}>
              <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>AGENT-READABLE ITEMS</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#34D399', marginTop: '2px' }}>
                {catalogJson?.item_count ?? '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Protocol Studio Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '28px', width: '100%' }}>
        
        {/* Left Column: Standardized Catalog Schema */}
        <div className="rzp-clean-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="pill-badge pill-mint" style={{ fontSize: '11px', fontWeight: 700 }}>GET</span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0D121F', wordBreak: 'break-all' }}>
                  {selectedEndpoint === 'discovery' ? '/.well-known/agent-commerce.json' : '/agent/v1/catalog'}
                </span>
              </div>
              <span style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', display: 'block' }}>
                {selectedEndpoint === 'discovery'
                  ? 'The first thing a buying agent reads: endpoints, spend authority, and settlement rails'
                  : 'Machine-readable structured catalog for autonomous AI buyers'}
              </span>

              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                {[['discovery', 'Discovery'], ['catalog', 'Catalog']].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setSelectedEndpoint(id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: selectedEndpoint === id ? '#2563EB' : '#E2E8F0',
                      background: selectedEndpoint === id ? '#EFF6FF' : '#FFFFFF',
                      color: selectedEndpoint === id ? '#2563EB' : '#64748B',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => handleCopy(JSON.stringify(selectedEndpoint === 'discovery' ? discoveryJson : catalogJson, null, 2))}
              className="rzp-btn-outline"
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              {copied ? <Check size={13} color="#059669" /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          </div>

          {/* Terminal Code Viewer */}
          <div className="rzp-terminal-window" style={{ flex: 1, minHeight: '440px', display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
            <div className="rzp-terminal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10B981', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>HTTP 200 OK • application/json</span>
              </div>
              <span style={{ fontSize: '11px', color: '#34D399', fontWeight: 600, flexShrink: 0 }}>
                {(discoveryJson?.protocol || catalogJson?.protocol || 'loading').toUpperCase()}
              </span>
            </div>

            <div className="rzp-terminal-body" style={{ flex: 1, maxHeight: '420px', overflowY: 'auto', minWidth: 0, padding: '16px' }}>
              {loadingCat ? (
                <span style={{ color: '#94A3B8' }}>Fetching agent protocol schemas...</span>
              ) : (
                <pre style={{ color: '#38BDF8', fontSize: '12px', wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(selectedEndpoint === 'discovery' ? discoveryJson : catalogJson, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive A2A Negotiation Simulator */}
        <div className="rzp-clean-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="pill-badge pill-blue" style={{ fontSize: '11px', fontWeight: 700 }}>POST</span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0D121F' }}>/agent/v1/negotiate</span>
              </div>
              <span style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', display: 'block' }}>
                Simulate autonomous negotiation between external AI buyer & RazorAgent
              </span>
            </div>

            <button
              disabled={isExecuting}
              onClick={handleRunNegotiation}
              className="rzp-btn-blue"
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              <Play size={14} />
              {isExecuting ? 'Negotiating...' : 'Execute A2A Call'}
            </button>
          </div>

          {/* Interactive Request Form */}
          <div style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px',
            minWidth: 0,
          }}>
            <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
              BUYER AGENT REQUEST PAYLOAD
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
              <div>
                <label style={{ color: '#64748B', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Target Items</label>
                <div style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#0D121F',
                  fontWeight: 600,
                  fontSize: '11px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  🎧 Aura Pro ANC + ⚡ MagCharge Dock
                </div>
              </div>

              <div>
                <label style={{ color: '#64748B', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Target Budget (₹)</label>
                <input
                  type="number"
                  value={negotiatePayload.target_budget_inr}
                  onChange={(e) => setNegotiatePayload({ ...negotiatePayload, target_budget_inr: Number(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    color: '#0D121F',
                    fontWeight: 700,
                    fontSize: '12px',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Terminal Response Viewer */}
          <div className="rzp-terminal-window" style={{ flex: 1, minHeight: '320px', display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
            <div className="rzp-terminal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10B981', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: '6px' }}>AGENT RESPONSE // INTENT GENERATED</span>
              </div>
            </div>

            <div className="rzp-terminal-body" style={{ flex: 1, maxHeight: '280px', overflowY: 'auto', minWidth: 0, padding: '16px' }}>
              {!negotiateResponse ? (
                <span style={{ color: '#64748B' }}>
                  Click 'Execute A2A Call' above to simulate live machine-to-machine bundle negotiation...
                </span>
              ) : (
                <pre style={{ color: '#34D399', fontSize: '12px', wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(negotiateResponse, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Machine purchase: the HTTP payment challenge, run live */}
      <div className="rzp-clean-card" style={{ padding: '24px', marginTop: '24px', minWidth: 0, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '18px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="pill-badge pill-blue" style={{ fontSize: '11px', fontWeight: 700 }}>POST</span>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#0D121F' }}>/agent/v1/purchase</span>
            </div>
            <span style={{ fontSize: '12px', color: '#64748B', marginTop: '4px', display: 'block', maxWidth: '640px', lineHeight: 1.5 }}>
              An AI buyer has no browser and nobody to click “Pay”. Ask to buy and the merchant
              answers <strong>402 Payment Required</strong> with the amount due and how to prove
              payment. Repeat the call with proof and it fulfils.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button onClick={handleRequestChallenge} disabled={purchaseBusy} className="rzp-btn-outline" style={{ padding: '9px 14px', fontSize: '12.5px' }}>
              {purchaseBusy && !challenge ? 'Requesting…' : '1 · Request to buy'}
            </button>
            <button onClick={handleSettle} disabled={!challenge || purchaseBusy || Boolean(receipt)} className="rzp-btn-blue" style={{ padding: '9px 14px', fontSize: '12.5px', opacity: challenge && !receipt ? 1 : 0.45 }}>
              {purchaseBusy && challenge ? 'Settling…' : '2 · Pay & redeem'}
            </button>
          </div>
        </div>

        {purchaseError && (
          <div style={{ padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#991B1B', fontSize: '12px', marginBottom: '14px' }}>
            {purchaseError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          <div className="rzp-terminal-window" style={{ minWidth: 0 }}>
            <div className="rzp-terminal-header">
              <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>THE CHALLENGE</span>
              {challenge && <span className="pill-badge pill-amber" style={{ fontSize: '10px' }}>HTTP 402</span>}
            </div>
            <div className="rzp-terminal-body" style={{ maxHeight: '300px', overflowY: 'auto', padding: '14px', minWidth: 0 }}>
              {!challenge ? (
                <span style={{ color: '#94A3B8', fontSize: '12px' }}>
                  Click “Request to buy” — no payment details are sent, so the merchant must challenge.
                </span>
              ) : (
                <pre style={{ color: '#FBBF24', fontSize: '11.5px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {JSON.stringify({ error: challenge.error, accepts: challenge.accepts, buyer_mandate: challenge.buyer_mandate, retry_with: challenge.retry_with }, null, 2)}
                </pre>
              )}
            </div>
          </div>

          <div className="rzp-terminal-window" style={{ minWidth: 0 }}>
            <div className="rzp-terminal-header">
              <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>THE RECEIPT</span>
              {receipt && <span className="pill-badge pill-mint" style={{ fontSize: '10px' }}>HTTP 200</span>}
            </div>
            <div className="rzp-terminal-body" style={{ maxHeight: '300px', overflowY: 'auto', padding: '14px', minWidth: 0 }}>
              {!receipt ? (
                <span style={{ color: '#94A3B8', fontSize: '12px' }}>
                  Settle the challenge and the signature is verified before anything is fulfilled.
                </span>
              ) : (
                <pre style={{ color: '#34D399', fontSize: '11.5px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {JSON.stringify(receipt, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
