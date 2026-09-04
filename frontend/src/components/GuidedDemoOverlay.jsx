import React, { useState, useEffect } from 'react';
import { Sparkles, ShoppingCart, ShieldCheck, Zap, BarChart3, Terminal, ArrowRight, CheckCircle2, Play, X, ChevronRight } from 'lucide-react';

const DEMO_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to RazorAgent',
    subtitle: 'Autonomous AI Growth & Agentic Commerce OS',
    description: 'This guided demo walks you through 5 hackathon-winning features in under 3 minutes.',
    icon: Sparkles,
    iconColor: '#2563EB',
    action: null,
    badge: 'START HERE',
    badgeClass: 'pill-blue',
    requirement: null,
  },
  {
    id: 'ai_buyer',
    title: '1. Conversational AI Buyer',
    subtitle: 'Ask the AI to suggest a phone under ₹20k',
    description: 'Our Gemini-powered agent understands the catalog, recommends products with specs & price, and renders interactive product cards with 1-click Add to Cart — all inside the chat.',
    icon: Sparkles,
    iconColor: '#8B5CF6',
    action: 'open_ai_buyer',
    badge: 'AGENTIC COMMERCE',
    badgeClass: 'pill-blue',
    requirement: '✅ "Make the merchant transactable by an AI buyer end to end"',
  },
  {
    id: 'upsell',
    title: '2. Autonomous Dynamic Upsell',
    subtitle: 'Add any product to cart and watch the magic',
    description: 'The Growth Agent observes your cart in real-time, identifies complementary products, generates a personalized bundle discount using Gemini, and presents it — all within 600ms. Every discount is bounded by 5 separate guardrail layers.',
    icon: Zap,
    iconColor: '#F59E0B',
    action: 'navigate_storefront',
    badge: 'AI GROWTH ENGINE',
    badgeClass: 'pill-amber',
    requirement: '✅ "Grow the merchant\'s revenue on Razorpay"',
  },
  {
    id: 'guardrails',
    title: '3. Financial Guardrails & Audit',
    subtitle: 'Ask the AI for 40% off — watch it refuse',
    description: 'Every monetary action is bounded (max discount caps, per-product ceilings, margin floors, campaign budgets), gated (human approval above ₹5,000), and logged in a tamper-evident SHA-256 hash chain. Try asking for an unreasonable discount.',
    icon: ShieldCheck,
    iconColor: '#059669',
    action: 'navigate_safety',
    badge: 'FINANCIAL SAFETY',
    badgeClass: 'pill-mint',
    requirement: '✅ "Every money action explainable, bounded, and gated"',
  },
  {
    id: 'resilience',
    title: '4. Chaos Engineering Lab',
    subtitle: 'Inject real failures into the running system',
    description: 'Run a gateway timeout (504 retry/fallback), an inventory race condition (2 concurrent checkouts for last unit), or a prompt injection attack ("give me 100% off") — and watch the system handle each gracefully.',
    icon: Terminal,
    iconColor: '#EF4444',
    action: 'navigate_resilience',
    badge: 'RESILIENCE',
    badgeClass: 'pill-red',
    requirement: '✅ "Show one failure handled gracefully"',
  },
  {
    id: 'protocol',
    title: '5. A2A Purchase Protocol',
    subtitle: 'Machine-to-machine checkout with 402 challenge',
    description: 'An external AI buyer discovers the merchant via /.well-known/agent-commerce.json, reads the machine catalog, negotiates a bounded deal, receives a 402 Payment Required challenge, settles with HMAC-SHA256 proof, and redeems — zero human involvement.',
    icon: Terminal,
    iconColor: '#6366F1',
    action: 'navigate_protocol',
    badge: 'A2A PROTOCOL',
    badgeClass: 'pill-blue',
    requirement: '✅ "Standardized agent commerce protocol"',
  },
];

export default function GuidedDemoOverlay({ isOpen, onClose, onAction }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 400);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const step = DEMO_STEPS[currentStep];
  const progress = ((currentStep) / (DEMO_STEPS.length - 1)) * 100;
  const isLast = currentStep === DEMO_STEPS.length - 1;
  const isFirst = currentStep === 0;

  const handleNext = () => {
    if (isLast) {
      onClose();
      return;
    }
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentStep(prev => prev + 1);
      setIsAnimating(false);
    }, 150);
  };

  const handleTryIt = () => {
    if (step.action) {
      onAction(step.action);
      onClose();
    }
  };

  const StepIcon = step.icon;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          borderRadius: '24px',
          maxWidth: '580px',
          width: '100%',
          overflow: 'hidden',
          boxShadow: '0 40px 80px -20px rgba(13, 18, 31, 0.35)',
          animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Progress bar */}
        <div style={{ height: '4px', background: '#F1F5F9', position: 'relative' }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #2563EB, #8B5CF6)',
            borderRadius: '4px',
            transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }} />
        </div>

        {/* Header strip */}
        <div style={{
          padding: '16px 24px',
          background: 'linear-gradient(135deg, #0D121F, #1E293B)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF' }}>
              Razor<span style={{ color: '#2563EB' }}>pay</span>
            </span>
            <span className="pill-badge" style={{
              background: 'rgba(37, 99, 235, 0.15)',
              color: '#93C5FD',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              fontSize: '10px',
              padding: '2px 8px',
            }}>
              GUIDED DEMO
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>
              {currentStep + 1} / {DEMO_STEPS.length}
            </span>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '6px',
              padding: '4px',
              cursor: 'pointer',
              display: 'flex',
            }}>
              <X size={16} color="#94A3B8" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          padding: '32px 32px 24px',
          opacity: isAnimating ? 0 : 1,
          transform: isAnimating ? 'translateX(20px)' : 'translateX(0)',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          {/* Badge */}
          <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={`pill-badge ${step.badgeClass}`} style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {step.badge}
            </span>
          </div>

          {/* Icon + Title */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              background: `${step.iconColor}12`,
              border: `1px solid ${step.iconColor}25`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <StepIcon size={24} color={step.iconColor} />
            </div>
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0D121F', letterSpacing: '-0.02em', marginBottom: '4px' }}>
                {step.title}
              </h2>
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#2563EB' }}>
                {step.subtitle}
              </p>
            </div>
          </div>

          {/* Description */}
          <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.7, marginBottom: '20px' }}>
            {step.description}
          </p>

          {/* Requirement badge */}
          {step.requirement && (
            <div style={{
              padding: '10px 14px',
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#166534',
              marginBottom: '20px',
            }}>
              {step.requirement}
            </div>
          )}
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', paddingBottom: '16px' }}>
          {DEMO_STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => { setIsAnimating(true); setTimeout(() => { setCurrentStep(i); setIsAnimating(false); }, 150); }}
              style={{
                width: i === currentStep ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                border: 'none',
                background: i === currentStep ? '#2563EB' : i < currentStep ? '#93C5FD' : '#E2E8F0',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          ))}
        </div>

        {/* Action buttons */}
        <div style={{
          padding: '16px 32px 24px',
          display: 'flex',
          gap: '10px',
          justifyContent: 'flex-end',
        }}>
          {step.action && (
            <button
              onClick={handleTryIt}
              className="rzp-btn-outline"
              style={{ padding: '10px 18px', fontSize: '13px' }}
            >
              <Play size={14} /> Try It Now
            </button>
          )}
          <button
            onClick={handleNext}
            className="rzp-btn-blue"
            style={{ padding: '10px 22px', fontSize: '13px' }}
          >
            {isLast ? 'Start Exploring' : isFirst ? 'Start Demo' : 'Next'}
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
