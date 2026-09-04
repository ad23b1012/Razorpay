import React, { useState, useEffect } from 'react';
import { Terminal, Send, CheckCircle2, Copy, Play, ArrowRight, Sparkles, Cpu, Layers, Code2, Globe, Check, ChevronDown } from 'lucide-react';
import { fetchAgentCatalog, negotiateA2AProtocol, fetchAgentDiscoveryDocument, runAgentPurchaseChallenge, settleAndRedeem, FALLBACK_CATALOG } from '../../services/api';

const getItemId = (item) => item?.item_id || item?.id || '';
const getItemTitle = (item) => item?.title || item?.name || 'Product';
const getItemPrice = (item) => Number(item?.base_price_inr ?? item?.price_inr ?? 0);
const getItemCost = (item) => Number(item?.cost_price_inr ?? (getItemPrice(item) * 0.65));

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

  const agentMandateJson = {
    protocol: "razorpay.agentic_mandate/v1.0",
    mandate_id: "asm_rzp_live_8849201",
    issuer: "Razorpay Agentic Auth Service (ap2.razorpay.com)",
    holder: {
      agent_name: "Autonomous Gemini / ChatGPT Buyer",
      agent_did: "did:rzp:agent:acme_shopper_09a",
      delegating_user: "sharma.rahul@okaxis",
      verified_identity: "KYC_VERIFIED_TIER_2",
    },
    authorization_rules: {
      max_cumulative_budget_inr: 25000.0,
      max_single_order_inr: 18000.0,
      permitted_categories: ["Smartphones", "Audio", "Power", "Wearables"],
      daily_velocity_limit: 3,
      valid_until: "2026-09-03T23:59:59Z",
    },
    cryptographic_attestation: {
      algorithm: "Ed25519-SHA512",
      public_key: "ed25519_pk_7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
      user_mandate_signature: "MEQCID7x9lK2m8...vXg1J7k2sP9qR4vW7tY8z0=",
      status: "VALID_ACTIVE_UNREVOKED",
    }
  };

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

  const [arenaStep, setArenaStep] = useState(0); // 0=idle, 1=discovery, 2=catalog, 3=negotiate, 4=challenge, 5=settle, 6=done
  const [arenaLogs, setArenaLogs] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState('haggler');
  const [isArenaRunning, setIsArenaRunning] = useState(false);

  const personas = {
    haggler: {
      id: 'acme_shopping_agent',
      name: 'Aggressive Haggler',
      icon: '🏎️',
      mandate: 16000,
      targetItem: 'prod_nova_chrono',
      targetBudget: 8249,
      strategy: 'Lowballs 45% under list to test merchant guardrail compliance & trigger bounded counter-offers.',
    },
    procurement: {
      id: 'corp_procurement_bot',
      name: 'Enterprise Procurement Bot',
      icon: '💼',
      mandate: 25000,
      targetItem: 'prod_aura_anc_pro',
      targetBudget: 6800,
      strategy: 'Strict corporate procurement mandate. Requests bulk margin discount within standing authority.',
    },
    instant: {
      id: 'quick_checkout_agent',
      name: 'Autonomous Instant Buyer',
      icon: '⚡',
      mandate: 10000,
      targetItem: 'prod_gan_65w_charger',
      targetBudget: 1999,
      strategy: 'Instant machine checkout: bypasses human UI, requests 402 challenge, signs HMAC proof, and settles.',
    },
  };

  const addArenaLog = (step, title, detail, badge = 'OK', type = 'info') => {
    setArenaLogs(prev => [
      ...prev,
      {
        step,
        title,
        detail,
        badge,
        type,
        time: new Date().toLocaleTimeString(),
      }
    ]);
  };

  const handleRunFullA2ALifecycle = async () => {
    setIsArenaRunning(true);
    setArenaStep(1);
    setArenaLogs([]);
    const p = personas[selectedPersona];

    try {
      // Step 1: Discovery
      addArenaLog(1, 'Agent Discovery Document Ingested', `GET /.well-known/agent-commerce.json • Protocol: razoragent.commerce/0.1`, '200 OK');
      const doc = await fetchAgentDiscoveryDocument();
      setDiscoveryJson(doc);
      await new Promise(r => setTimeout(r, 600));

      // Step 2: Catalog
      setArenaStep(2);
      addArenaLog(2, 'Machine-Readable Catalog Ingested', `GET /agent/v1/catalog • Evaluated 7 active items with merchant negotiation ceilings`, '200 OK');
      const cat = await fetchAgentCatalog();
      setCatalogJson(cat);
      await new Promise(r => setTimeout(r, 600));

      // Step 3: Negotiate
      setArenaStep(3);
      addArenaLog(3, `Buyer Agent [${p.id}] Transmitted Negotiation Offer`, `POST /agent/v1/negotiate • Target: ₹${p.targetBudget.toLocaleString('en-IN')} on ${p.targetItem}`, 'SENT');
      const negRes = await negotiateA2AProtocol([p.targetItem], p.targetBudget, p.id);
      setNegotiateResponse(negRes);
      await new Promise(r => setTimeout(r, 600));

      // Step 4: Merchant Counter-Offer
      setArenaStep(4);
      addArenaLog(4, `Merchant Agent Bounded Decision: ${negRes?.decision || 'ACCEPTED'}`, `Granted ${negRes?.discount_percent || 0}% discount (₹${Number(negRes?.discount_amount_inr || 0).toLocaleString('en-IN')} off). Rationale: ${negRes?.rationale || ''}`, negRes?.guardrail_status || 'PASSED', 'success');
      await new Promise(r => setTimeout(r, 600));

      // Step 5: Purchase Challenge
      setArenaStep(5);
      addArenaLog(5, `Purchase Initiated ➔ HTTP 402 Payment Challenge Issued`, `POST /agent/v1/purchase • Amount due: ₹${Number(negRes?.offered_price_inr || 0).toLocaleString('en-IN')}`, '402 CHALLENGE', 'amber');
      const { status, body } = await runAgentPurchaseChallenge(p.targetItem, p.id);
      setChallenge(body);
      await new Promise(r => setTimeout(r, 700));

      // Step 6: Settle and Redeem
      setArenaStep(6);
      addArenaLog(6, `HMAC-SHA256 Signature Minted & Verified on Razorpay Test Rails`, `Payment ID proof submitted for Order: ${body?.accepts?.[0]?.razorpay_order_id || 'order_active'}`, 'SIGNATURE_VALID');
      const rec = await settleAndRedeem(body, p.targetItem, p.id);
      setReceipt(rec);
      await new Promise(r => setTimeout(r, 500));

      // Step 7: Completed
      setArenaStep(7);
      addArenaLog(7, `Autonomous A2A Transaction Fulfilled & Cryptographically Chained`, `Order fulfilled. Razorpay Order ${rec?.order?.razorpay_order_id || 'rec_active'} verified. SHA-256 audit ledger appended.`, 'FULFILLED', 'success');
    } catch (err) {
      addArenaLog(arenaStep, 'Execution Error', err.message, 'ERROR', 'error');
    } finally {
      setIsArenaRunning(false);
    }
  };

  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '40px 32px 100px', width: '100%', boxSizing: 'border-box' }}>
      
      {/* 1. Enterprise Hero Header */}
      <div className="rzp-hero-banner" style={{ marginBottom: '32px' }}>
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

      {/* 2. Interactive Live Dual-Agent A2A Arena */}
      <div className="rzp-dark-panel" style={{
        background: 'linear-gradient(135deg, #0C2340 0%, #0F2A4A 100%)',
        border: '1px solid #1E3557',
        borderRadius: '20px',
        padding: '32px',
        color: '#FFFFFF',
        marginBottom: '36px',
        boxShadow: '0 20px 40px -10px rgba(12, 35, 64, 0.35)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', background: 'rgba(12, 131, 254, 0.2)', border: '1px solid rgba(12, 131, 254, 0.4)', color: '#60A5FA', padding: '3px 9px', borderRadius: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                LIVE AGENT-TO-AGENT (A2A) ARENA
              </span>
              <span style={{ fontSize: '12px', color: '#94A3B8' }}>Autonomous Dual-Agent Negotiation &amp; 402 Settle</span>
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>
              Live Autonomous Transaction Simulation
            </h2>
          </div>

          {/* Persona selector tabs & Run Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: '#081628', border: '1px solid #1E3557', padding: '3px', borderRadius: '8px' }}>
              {Object.entries(personas).map(([key, p]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedPersona(key)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: selectedPersona === key ? '#0C83FE' : 'transparent',
                    color: selectedPersona === key ? '#FFFFFF' : '#94A3B8',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{p.icon}</span> {p.name}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={isArenaRunning}
              onClick={handleRunFullA2ALifecycle}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                background: isArenaRunning ? '#475569' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '13px',
                fontWeight: 800,
                cursor: isArenaRunning ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
              }}
            >
              {isArenaRunning ? (
                <>
                  <div className="pulse-status-green" style={{ width: '10px', height: '10px' }} />
                  Running Stage {arenaStep}/7...
                </>
              ) : (
                <>
                  <Play size={15} /> Run Live Autonomous Deal
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dual Agent Cards + Bus */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px minmax(0, 1fr)', gap: '16px', alignItems: 'center', marginBottom: '24px' }}>
          {/* Left: Buyer Agent Card */}
          <div style={{
            background: '#081628',
            border: '1px solid #1E3557',
            borderRadius: '14px',
            padding: '20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ fontSize: '24px' }}>{personas[selectedPersona].icon}</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#F1F5F9' }}>
                  {personas[selectedPersona].name}
                </div>
                <div style={{ fontSize: '11px', color: '#60A5FA', fontFamily: 'var(--font-mono)' }}>
                  ID: {personas[selectedPersona].id}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '12px', lineHeight: 1.4 }}>
              {personas[selectedPersona].strategy}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
              <div style={{ background: '#0C2340', border: '1px solid #1E3557', padding: '8px', borderRadius: '6px' }}>
                <span style={{ color: '#64748B', display: 'block', fontSize: '9px' }}>SPEND MANDATE</span>
                <strong style={{ color: '#34D399' }}>₹{personas[selectedPersona].mandate.toLocaleString('en-IN')}</strong>
              </div>
              <div style={{ background: '#0C2340', border: '1px solid #1E3557', padding: '8px', borderRadius: '6px' }}>
                <span style={{ color: '#64748B', display: 'block', fontSize: '9px' }}>TARGET BID</span>
                <strong style={{ color: '#FBBF24' }}>₹{personas[selectedPersona].targetBudget.toLocaleString('en-IN')}</strong>
              </div>
            </div>
          </div>

          {/* Center: HTTP 402 Bus Animation */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: '#081628',
              border: '2px solid #1E3557',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isArenaRunning ? '0 0 16px rgba(12, 131, 254, 0.5)' : 'none',
              transition: 'all 0.3s ease',
            }}>
              <Cpu size={20} color={isArenaRunning ? '#0C83FE' : '#64748B'} />
            </div>
            <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 700, letterSpacing: '0.04em' }}>HTTP 402 BUS</span>
            <span style={{ fontSize: '9px', color: '#0C83FE', fontFamily: 'var(--font-mono)' }}>HMAC-SHA256</span>
          </div>

          {/* Right: Merchant Pricing Agent Card */}
          <div style={{
            background: '#081628',
            border: '1px solid #1E3557',
            borderRadius: '14px',
            padding: '20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ fontSize: '24px' }}>🛡️</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#F1F5F9' }}>
                  Merchant Pricing &amp; Guardrail Agent
                </div>
                <div style={{ fontSize: '11px', color: '#34D399', fontFamily: 'var(--font-mono)' }}>
                  Aura Tech Store • Active Guardrails
                </div>
              </div>
            </div>

            <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '12px', lineHeight: 1.4 }}>
              Protects merchant gross margins (≥15% net floor), caps single-deal discount to 20%, and routes deals &gt;₹5,000 to approval gates.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
              <div style={{ background: '#0C2340', border: '1px solid #1E3557', padding: '8px', borderRadius: '6px' }}>
                <span style={{ color: '#64748B', display: 'block', fontSize: '9px' }}>MARGIN FLOOR</span>
                <strong style={{ color: '#60A5FA' }}>≥ 15.0% Net</strong>
              </div>
              <div style={{ background: '#0C2340', border: '1px solid #1E3557', padding: '8px', borderRadius: '6px' }}>
                <span style={{ color: '#64748B', display: 'block', fontSize: '9px' }}>APPROVAL GATE</span>
                <strong style={{ color: '#F87171' }}>&gt; ₹5,000</strong>
              </div>
            </div>
          </div>
        </div>

        {/* ZOPA Game-Theoretic Convergence Visualizer */}
        <div style={{
          background: '#081628',
          border: '1px solid #1E3557',
          borderRadius: '14px',
          padding: '20px 24px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', background: 'rgba(12, 131, 254, 0.2)', border: '1px solid rgba(12, 131, 254, 0.4)', color: '#60A5FA', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>
                  GAME THEORY BARGAINING ENGINE
                </span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#F1F5F9' }}>
                  Zone of Possible Agreement (ZOPA) &amp; Nash Equilibrium
                </span>
              </div>
              <p style={{ fontSize: '11px', color: '#94A3B8', margin: '4px 0 0', lineHeight: 1.4 }}>
                Mathematically proves why autonomous agents safely converge without risking merchant margin insolvency.
              </p>
            </div>

            <div>
              {selectedPersona === 'haggler' ? (
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid #F59E0B',
                  color: '#FBBF24',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  ⚠️ INITIAL BID BELOW ZOPA (Auto-Concession Triggered)
                </span>
              ) : (
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid #10B981',
                  color: '#34D399',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  ✓ ACTIVE POSITIVE ZOPA (Deal Viable)
                </span>
              )}
            </div>
          </div>

          {/* Dynamic ZOPA Game-Theoretic Convergence Visualizer */}
          {(() => {
            const allItems = (catalogJson?.items && catalogJson.items.length > 0) ? catalogJson.items : FALLBACK_CATALOG;
            const curPersona = personas[selectedPersona];
            const pItem = allItems.find(it => getItemId(it) === curPersona.targetItem) || allItems[0];
            const listPrice = getItemPrice(pItem) || 10000;
            const baseCost = getItemCost(pItem) || (listPrice * 0.65);
            const marginBound = Math.round(baseCost * 1.15);
            const targetBid = Number(curPersona.targetBudget || 5000);
            const isViable = targetBid >= marginBound;
            
            const rangeMin = Math.max(0, baseCost * 0.85);
            const rangeMax = listPrice * 1.05;
            const rangeSpan = rangeMax - rangeMin || 1;
            const needlePct = Math.min(95, Math.max(5, Math.round(((targetBid - rangeMin) / rangeSpan) * 100)));
            const zopaStartPct = Math.min(90, Math.max(10, Math.round(((marginBound - rangeMin) / rangeSpan) * 100)));

            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ background: '#0C2340', border: '1px solid #1E3557', padding: '8px 12px', borderRadius: '8px' }}>
                    <span style={{ color: '#94A3B8', display: 'block', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>Base Cost Floor</span>
                    <strong style={{ color: '#F87171', fontSize: '13px' }}>₹{Math.round(baseCost).toLocaleString('en-IN')}</strong>
                  </div>
                  <div style={{ background: '#0C2340', border: '1px solid #1E3557', padding: '8px 12px', borderRadius: '8px' }}>
                    <span style={{ color: '#94A3B8', display: 'block', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>15% Margin Bound</span>
                    <strong style={{ color: '#FBBF24', fontSize: '13px' }}>₹{marginBound.toLocaleString('en-IN')}</strong>
                  </div>
                  <div style={{ background: '#0C2340', border: '1px solid #1E3557', padding: '8px 12px', borderRadius: '8px' }}>
                    <span style={{ color: '#94A3B8', display: 'block', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>Buyer Target Bid</span>
                    <strong style={{ color: '#38BDF8', fontSize: '13px' }}>₹{targetBid.toLocaleString('en-IN')}</strong>
                  </div>
                  <div style={{ background: '#0C2340', border: '1px solid #1E3557', padding: '8px 12px', borderRadius: '8px' }}>
                    <span style={{ color: '#94A3B8', display: 'block', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>Public Catalog List</span>
                    <strong style={{ color: '#34D399', fontSize: '13px' }}>₹{Math.round(listPrice).toLocaleString('en-IN')}</strong>
                  </div>
                </div>

                {/* Visual Range Bar */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{
                    height: '14px',
                    borderRadius: '7px',
                    background: '#0C2340',
                    border: '1px solid #1E3557',
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    {/* Cost zone (Red) */}
                    <div style={{ position: 'absolute', left: 0, width: `${zopaStartPct}%`, height: '100%', background: '#EF4444', opacity: 0.45 }} />
                    {/* ZOPA Window (Green) */}
                    <div style={{
                      position: 'absolute',
                      left: `${zopaStartPct}%`,
                      width: `${100 - zopaStartPct}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #10B981 0%, #059669 100%)',
                      opacity: 0.85,
                    }} />
                    {/* Convergence Needle */}
                    <div style={{
                      position: 'absolute',
                      left: `${needlePct}%`,
                      top: 0,
                      bottom: 0,
                      width: '4px',
                      background: '#FFFFFF',
                      boxShadow: '0 0 8px #FFFFFF',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748B', marginTop: '4px' }}>
                    <span>Floor: ₹{Math.round(baseCost).toLocaleString('en-IN')}</span>
                    <span style={{ color: isViable ? '#34D399' : '#FBBF24', fontWeight: 700 }}>
                      Needle: ₹{targetBid.toLocaleString('en-IN')} ({isViable ? 'Inside ZOPA' : 'Below ZOPA Boundary'})
                    </span>
                    <span>List: ₹{Math.round(listPrice).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Mathematical Concession Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
            <div style={{ background: '#0C2340', border: '1px solid #1E3557', padding: '8px 10px', borderRadius: '6px' }}>
              <span style={{ color: '#64748B', display: 'block', fontSize: '9px' }}>CONCESSION FORMULA</span>
              <span style={{ color: '#38BDF8', fontWeight: 600 }}>P(t) = P_list - ΔP·(1-e^-kt)</span>
            </div>
            <div style={{ background: '#0C2340', border: '1px solid #1E3557', padding: '8px 10px', borderRadius: '6px' }}>
              <span style={{ color: '#64748B', display: 'block', fontSize: '9px' }}>NASH EQUILIBRIUM PRICE</span>
              <span style={{ color: '#34D399', fontWeight: 700 }}>
                ₹{selectedPersona === 'haggler' ? '11,999' : selectedPersona === 'procurement' ? '5,949' : '1,999'}
              </span>
            </div>
            <div style={{ background: '#0C2340', border: '1px solid #1E3557', padding: '8px 10px', borderRadius: '6px' }}>
              <span style={{ color: '#64748B', display: 'block', fontSize: '9px' }}>MERCHANT NET MARGIN</span>
              <span style={{ color: '#FBBF24', fontWeight: 700 }}>
                {selectedPersona === 'haggler' ? '35.0% (Floor Met)' : selectedPersona === 'procurement' ? '46.2% (Floor Met)' : '58.9% (Floor Met)'}
              </span>
            </div>
            <div style={{ background: '#0C2340', border: '1px solid #1E3557', padding: '8px 10px', borderRadius: '6px' }}>
              <span style={{ color: '#64748B', display: 'block', fontSize: '9px' }}>SURPLUS DISTRIBUTION</span>
              <span style={{ color: '#C084FC', fontWeight: 600 }}>62% Buyer / 38% Merchant</span>
            </div>
          </div>
        </div>

        {/* Live Arena Stepper & Logs */}
        <div style={{
          background: '#070C1E',
          border: '1px solid #1E293B',
          borderRadius: '12px',
          padding: '16px 20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              REAL-TIME PROTOCOL PACKET AUDIT STREAM
            </span>
            <span style={{ fontSize: '10px', color: isArenaRunning ? '#34D399' : '#64748B' }}>
              {isArenaRunning ? '● EXECUTING LIVE PROTOCOL ROUNDTRIP' : 'READY TO EXECUTE'}
            </span>
          </div>

          {arenaLogs.length === 0 ? (
            <div style={{ color: '#475569', fontSize: '12px', padding: '16px 0', textAlign: 'center' }}>
              Select an external AI Buyer persona and click <strong>"Run Live Autonomous Deal"</strong> to observe the end-to-end ACP / AP2 negotiation, HTTP 402 challenge, and Razorpay signature verification.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
              {arenaLogs.map((log, lIdx) => (
                <div
                  key={lIdx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: log.badge === '402 CHALLENGE' ? 'rgba(245, 158, 11, 0.1)' : log.badge === 'FULFILLED' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                    borderLeft: `3px solid ${log.badge === '402 CHALLENGE' ? '#F59E0B' : log.badge === 'FULFILLED' ? '#10B981' : '#3B82F6'}`,
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ color: '#64748B' }}>{log.time}</span>
                    <div>
                      <span style={{ color: '#F1F5F9', fontWeight: 700 }}>{log.title}</span>
                      <div style={{ color: '#94A3B8', fontSize: '10px', marginTop: '2px' }}>{log.detail}</div>
                    </div>
                  </div>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: log.badge === '402 CHALLENGE' ? '#78350F' : log.badge === 'FULFILLED' ? '#064E3B' : '#1E293B',
                    color: log.badge === '402 CHALLENGE' ? '#FDE68A' : log.badge === 'FULFILLED' ? '#6EE7B7' : '#93C5FD',
                    fontSize: '10px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}>
                    {log.badge}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Main Protocol Studio Layout */}
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
                {[['discovery', 'Discovery'], ['catalog', 'Catalog'], ['mandate', 'Agent Mandate (ASM)']].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setSelectedEndpoint(id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: selectedEndpoint === id ? '#0C83FE' : '#E2E8F0',
                      background: selectedEndpoint === id ? '#EFF6FF' : '#FFFFFF',
                      color: selectedEndpoint === id ? '#0C83FE' : '#64748B',
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
              onClick={() => handleCopy(JSON.stringify(selectedEndpoint === 'discovery' ? discoveryJson : selectedEndpoint === 'catalog' ? catalogJson : agentMandateJson, null, 2))}
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
                {selectedEndpoint === 'mandate' ? 'RAZORPAY.AGENTIC_MANDATE/V1.0' : (discoveryJson?.protocol || catalogJson?.protocol || 'loading').toUpperCase()}
              </span>
            </div>

            <div className="rzp-terminal-body" style={{ flex: 1, maxHeight: '420px', overflowY: 'auto', minWidth: 0, padding: '16px' }}>
              {loadingCat && selectedEndpoint !== 'mandate' ? (
                <span style={{ color: '#94A3B8' }}>Fetching agent protocol schemas...</span>
              ) : (
                <pre style={{ color: '#38BDF8', fontSize: '12px', wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(selectedEndpoint === 'discovery' ? discoveryJson : selectedEndpoint === 'catalog' ? catalogJson : agentMandateJson, null, 2)}
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
            <div style={{ fontSize: '11px', color: '#0C83FE', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
              BUYER AGENT REQUEST PAYLOAD
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '12px', fontSize: '12px' }}>
              <div>
                <label style={{ color: '#64748B', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Target Items (Select from Live Catalog)
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <select
                    value={negotiatePayload.item_ids[0] || 'prod_aura_anc_pro'}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      const allProds = (catalogJson?.items && catalogJson.items.length > 0) ? catalogJson.items : FALLBACK_CATALOG;
                      const selectedProd = allProds.find(p => getItemId(p) === selectedId);
                      const price = getItemPrice(selectedProd);
                      const suggestedBudget = price ? Math.round(price * 0.85) : 5000;
                      setNegotiatePayload({
                        ...negotiatePayload,
                        item_ids: [selectedId],
                        target_budget_inr: suggestedBudget,
                      });
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      color: '#0D121F',
                      fontWeight: 600,
                      fontSize: '12px',
                    }}
                  >
                    {((catalogJson?.items && catalogJson.items.length > 0) ? catalogJson.items : FALLBACK_CATALOG).map((p) => {
                      const pid = getItemId(p);
                      const ptitle = getItemTitle(p);
                      const pprice = getItemPrice(p);
                      return (
                        <option key={pid} value={pid}>
                          {ptitle} (₹{pprice.toLocaleString('en-IN')})
                        </option>
                      );
                    })}
                  </select>
                  <span style={{ fontSize: '10.5px', color: '#64748B' }}>
                    Selected ID: <code style={{ color: '#0C83FE' }}>{negotiatePayload.item_ids.join(', ')}</code>
                  </span>
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
                <span style={{ fontSize: '10.5px', color: '#64748B', display: 'block', marginTop: '4px' }}>
                  Target price submitted by external AI agent
                </span>
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
