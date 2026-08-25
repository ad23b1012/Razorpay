import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Bot, User, CheckCircle2, ShieldAlert, ArrowRight, CornerDownLeft } from 'lucide-react';
import { sendChatMessage } from '../../services/api';

export default function BuyerChatDrawer({
  isOpen,
  onClose,
  cartItems,
  onAddToCartById,
  onApplyDiscount,
  onTriggerCheckout,
}) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hello! I am your RazorAgent Conversational Buyer Assistant. I can help you find products, compare specs, negotiate bundle discounts within merchant bounds, or checkout immediately. What would you like to buy today?',
      reasoning: 'Session initialized. Ready for conversational buyer transactions.',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const quickPrompts = [
    '🎧 Find wireless headphones with ANC under ₹8,000',
    '⚡ Get me the best bundle deal on charging accessories',
    '⌚ Show titanium smartwatch details',
    '💳 Proceed to Razorpay checkout',
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  if (!isOpen) return null;

  const handleSend = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    const userMsg = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const response = await sendChatMessage(
        text,
        'sess_buyer_chat',
        cartItems.map(it => ({ product_id: it.id, quantity: it.quantity }))
      );

      const assistantMsg = {
        role: 'assistant',
        text: response.reply,
        action: response.action,
        actionPayload: response.action_payload,
        reasoning: response.reasoning,
        guardrailStatus: response.guardrail_status,
      };

      setMessages(prev => [...prev, assistantMsg]);

      if (response.action === 'ADD_TO_CART') {
        const pid = response.action_payload?.product_id || (response.action_payload?.product_ids?.[0]);
        if (pid) onAddToCartById(pid);
      } else if (response.action === 'APPLY_DISCOUNT' && response.action_payload?.discount_pct) {
        // An ask beyond the agent's authority is carried to checkout as-is, where
        // the guardrail engine caps or gates it. Say so rather than implying it
        // has already been granted.
        const escalated = Boolean(response.action_payload.exceeds_agent_authority);
        onApplyDiscount(
          response.action_payload.discount_pct,
          escalated
            ? `${response.action_payload.discount_pct}% requested — pending merchant review`
            : 'AI negotiated deal',
          escalated
        );
      } else if (response.action === 'TRIGGER_CHECKOUT') {
        setTimeout(() => {
          onTriggerCheckout();
        }, 800);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: 'I encountered an issue connecting with the agent. Please try again.',
          guardrailStatus: 'ERROR',
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

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
        maxWidth: '480px',
        height: '100%',
        background: '#FFFFFF',
        borderLeft: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(12, 35, 64, 0.15)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #E2E8F0',
          background: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#0C83FE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Sparkles size={18} color="#FFFFFF" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0C2340' }}>AI Buyer Assistant</h3>
                <span className="rzp-badge rzp-badge-blue" style={{ fontSize: '10px' }}>GEMINI 2.0</span>
              </div>
              <span style={{ fontSize: '11px', color: '#64748B' }}>
                Conversational In-App Checkout
              </span>
            </div>
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

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          background: '#F8FAFC',
        }}>
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div style={{
                maxWidth: '85%',
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                background: msg.role === 'user' ? '#0C83FE' : '#FFFFFF',
                border: msg.role === 'user' ? 'none' : '1px solid #E2E8F0',
                color: msg.role === 'user' ? '#FFFFFF' : '#0C2340',
                fontSize: '14px',
                lineHeight: 1.5,
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              }}>
                {msg.text}

                {/* Action Trigger Badge */}
                {msg.action && msg.action !== 'NONE' && (
                  <div style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    background: '#E6FAF7',
                    border: '1px solid rgba(0, 210, 180, 0.3)',
                    fontSize: '11px',
                    color: '#00A38C',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <CheckCircle2 size={12} />
                    Executed Action: {msg.action}
                  </div>
                )}

                {/* Explainability Note */}
                {msg.reasoning && (
                  <div style={{
                    marginTop: '8px',
                    fontSize: '11px',
                    color: msg.role === 'user' ? 'rgba(255,255,255,0.8)' : '#64748B',
                    borderTop: msg.role === 'user' ? '1px dashed rgba(255,255,255,0.2)' : '1px dashed #E2E8F0',
                    paddingTop: '6px',
                  }}>
                    🔍 <em>{msg.reasoning}</em>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748B', fontSize: '13px' }}>
              <span className="live-dot" />
              <span>AI Agent reasoning...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid #E2E8F0',
          background: '#FFFFFF',
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
        }}>
          {quickPrompts.map((qp, i) => (
            <button
              key={i}
              onClick={() => handleSend(qp)}
              style={{
                whiteSpace: 'nowrap',
                background: '#F1F5F9',
                border: '1px solid #E2E8F0',
                color: '#475569',
                fontSize: '12px',
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = '#0C83FE';
                e.target.style.color = '#0C83FE';
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = '#E2E8F0';
                e.target.style.color = '#475569';
              }}
            >
              {qp}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <div style={{
          padding: '16px 20px',
          background: '#FFFFFF',
          borderTop: '1px solid #E2E8F0',
        }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            style={{ display: 'flex', gap: '8px' }}
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask anything or request bundle deals..."
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '6px',
                background: '#F8FAFC',
                border: '1px solid #CBD5E1',
                color: '#0C2340',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              className="btn-rzp-primary"
              style={{ padding: '0 16px' }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
