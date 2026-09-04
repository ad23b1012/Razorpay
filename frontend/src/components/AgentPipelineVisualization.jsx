import React, { useState, useEffect, useRef } from 'react';
import { Brain, ShieldCheck, CreditCard, FileSearch, CheckCircle2, AlertTriangle, Zap, ArrowRight } from 'lucide-react';

const PIPELINE_STAGES = [
  { id: 'intent', label: 'Intent Detection', sublabel: 'Gemini LLM', icon: Brain, color: '#8B5CF6' },
  { id: 'guardrail', label: 'Guardrail Check', sublabel: '5-Layer Bounds', icon: ShieldCheck, color: '#059669' },
  { id: 'action', label: 'Execute Action', sublabel: 'Cart / Offer / Pay', icon: Zap, color: '#2563EB' },
  { id: 'audit', label: 'Audit Logged', sublabel: 'SHA-256 Chain', icon: FileSearch, color: '#F59E0B' },
];

export default function AgentPipelineVisualization({ lastAgentEvent }) {
  const [activeStage, setActiveStage] = useState(-1);
  const [stageResults, setStageResults] = useState({});
  const [isAnimating, setIsAnimating] = useState(false);
  const animTimeoutRef = useRef(null);

  // Whenever a new agent event arrives, animate through the pipeline
  useEffect(() => {
    if (!lastAgentEvent) return;

    // Clear previous animation
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    setIsAnimating(true);
    setActiveStage(0);
    setStageResults({});

    const delays = [0, 600, 1200, 1800];
    const results = {
      intent: {
        status: 'success',
        detail: lastAgentEvent.action || 'NONE',
        reasoning: lastAgentEvent.reasoning?.slice(0, 120) || 'Analyzing user request...',
      },
      guardrail: {
        status: lastAgentEvent.guardrailStatus === 'PASSED' ? 'success' : 'blocked',
        detail: lastAgentEvent.guardrailStatus || 'CHECKING',
        reasoning: lastAgentEvent.guardrailStatus === 'PASSED'
          ? 'All 5 policy bounds passed'
          : 'Blocked — exceeds policy bounds',
      },
      action: {
        status: 'success',
        detail: lastAgentEvent.action || 'SHOW_PRODUCTS',
        reasoning: `Executed ${lastAgentEvent.action || 'response'}`,
      },
      audit: {
        status: 'success',
        detail: lastAgentEvent.auditId || `aud_${Date.now().toString(16).slice(-8)}`,
        reasoning: 'Hash chain entry created',
      },
    };

    delays.forEach((delay, idx) => {
      animTimeoutRef.current = setTimeout(() => {
        setActiveStage(idx);
        setStageResults(prev => ({
          ...prev,
          [PIPELINE_STAGES[idx].id]: results[PIPELINE_STAGES[idx].id],
        }));
        if (idx === delays.length - 1) {
          setTimeout(() => setIsAnimating(false), 800);
        }
      }, delay);
    });

    return () => {
      if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    };
  }, [lastAgentEvent]);

  const stats = lastAgentEvent?.stats || { decisions: 0, guardrailChecks: 0, revenueAttributed: 0 };

  return (
    <div className="rzp-dark-panel" style={{
      background: 'linear-gradient(135deg, #0C2340 0%, #102644 60%, #0C2340 100%)',
      border: '1px solid #1E3A5F',
      borderRadius: '18px',
      padding: '24px 28px',
      marginBottom: '32px',
      color: '#FFFFFF',
      overflow: 'hidden',
      position: 'relative',
      boxShadow: '0 12px 30px -8px rgba(12, 35, 64, 0.3)',
    }}>
      {/* Animated background grid */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: `
          linear-gradient(rgba(12, 131, 254, 0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(12, 131, 254, 0.04) 1px, transparent 1px)
        `,
        backgroundSize: '28px 28px',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span className="pill-badge pill-mint" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <span className="pulse-status-green" /> LIVE AGENT PIPELINE
              </span>
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '4px' }}>
              Agentic Decision Pipeline
            </h2>
            <p style={{ fontSize: '13px', color: '#94A3B8' }}>
              Every AI action passes through this pipeline in real time. Try the AI Buyer to see it animate.
            </p>
          </div>

          {/* Live stats */}
          <div style={{ display: 'flex', gap: '16px' }}>
            {[
              { label: 'AI Orders', value: stats.decisions, color: '#8B5CF6' },
              { label: 'Guardrail Checks', value: stats.guardrailChecks, color: '#059669' },
              { label: 'Incremental Lift', value: `₹${(stats.revenueAttributed || 0).toLocaleString('en-IN')}`, color: '#F59E0B' },
            ].map((s) => (
              <div key={s.label} style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                padding: '12px 16px',
                minWidth: '90px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: s.color, marginBottom: '2px' }}>
                  {s.value}
                </div>
                <div style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline stages */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, 1fr)`,
          gap: '4px',
          position: 'relative',
        }}>
          {PIPELINE_STAGES.map((stage, idx) => {
            const StageIcon = stage.icon;
            const result = stageResults[stage.id];
            const isActive = activeStage >= idx;
            const isCurrent = activeStage === idx && isAnimating;
            const isBlocked = result?.status === 'blocked';

            return (
              <div key={stage.id} style={{ position: 'relative' }}>
                {/* Connector line */}
                {idx > 0 && (
                  <div style={{
                    position: 'absolute',
                    left: '-2px',
                    top: '28px',
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: isActive ? stage.color : 'rgba(255,255,255,0.15)',
                    transition: 'all 0.4s ease',
                  }} />
                )}

                <div style={{
                  background: isCurrent
                    ? `${stage.color}18`
                    : isActive
                      ? 'rgba(255,255,255,0.06)'
                      : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isCurrent ? `${stage.color}40` : isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
                  borderRadius: '12px',
                  padding: '16px',
                  transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  transform: isCurrent ? 'scale(1.02)' : 'scale(1)',
                }}>
                  {/* Stage header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: isActive ? `${stage.color}20` : 'rgba(255,255,255,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.3s ease',
                    }}>
                      {isBlocked ? (
                        <AlertTriangle size={16} color="#EF4444" />
                      ) : result?.status === 'success' ? (
                        <CheckCircle2 size={16} color={stage.color} />
                      ) : isCurrent ? (
                        <div className="spin" style={{ width: 16, height: 16, border: `2px solid ${stage.color}40`, borderTopColor: stage.color, borderRadius: '50%' }} />
                      ) : (
                        <StageIcon size={16} color={isActive ? stage.color : '#475569'} />
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: isActive ? '#FFFFFF' : '#64748B' }}>
                        {stage.label}
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748B' }}>
                        {stage.sublabel}
                      </div>
                    </div>
                  </div>

                  {/* Result detail */}
                  {result && (
                    <div style={{
                      fontSize: '11px',
                      color: '#94A3B8',
                      padding: '8px 10px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '6px',
                      fontFamily: 'var(--font-mono)',
                      lineHeight: 1.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      <span style={{ color: isBlocked ? '#EF4444' : stage.color, fontWeight: 700 }}>
                        {result.detail}
                      </span>
                      <br />
                      {result.reasoning}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
