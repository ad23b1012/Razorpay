import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Bot, User, CheckCircle2, ShieldAlert, ShieldCheck, ArrowRight, CornerDownLeft, ShoppingCart, Zap, ChevronDown, ChevronUp, Terminal, Scale, Hash, Check, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { sendChatMessage } from '../../services/api';
import { productPlaceholder, handleImageError } from '../../utils/productPlaceholder';

export default function BuyerChatDrawer({
  isOpen,
  onClose,
  products = [],
  cartItems,
  onAddToCartById,
  onApplyDiscount,
  onTriggerCheckout,
  onAgentEvent,
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
  const [expandedTraceIndex, setExpandedTraceIndex] = useState(null);
  const [copiedHash, setCopiedHash] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [selectedVoicePersona, setSelectedVoicePersona] = useState('aura');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState('en-IN'); // 'en-IN' | 'hi-IN'
  const [liveVoiceMode, setLiveVoiceMode] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const transcriptBufferRef = useRef('');
  const liveVoiceModeRef = useRef(false);
  const handleSendRef = useRef(null);

  useEffect(() => {
    liveVoiceModeRef.current = liveVoiceMode;
  }, [liveVoiceMode]);

  // Load natural neural voices from browser
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const updateVoices = () => {
        const v = window.speechSynthesis.getVoices();
        if (v && v.length > 0) setAvailableVoices(v);
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  // Find the highest quality, most natural neural voice
  const getBestVoice = (personaKey) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    if (selectedLanguage === 'hi-IN' || personaKey === 'kavya') {
      const inVoice = voices.find(v => 
        v.lang === 'hi-IN' || 
        v.lang.startsWith('hi') ||
        v.name.includes('Google हिन्दी') || 
        v.name.includes('Hindi') || 
        v.name.includes('Swara') || 
        v.name.includes('Madhur') || 
        v.name.includes('Lekha') || 
        v.name.includes('Kalpana') ||
        v.lang === 'en-IN' || 
        v.name.includes('India') || 
        v.name.includes('Neerja') || 
        v.name.includes('Veena') || 
        v.name.includes('Rishi')
      );
      if (inVoice) return inVoice;
    }

    if (personaKey === 'ryan') {
      const maleVoice = voices.find(v => 
        (v.name.includes('Ryan') || v.name.includes('Daniel') || v.name.includes('Google US English') || v.name.includes('Arthur')) &&
        v.lang.startsWith('en')
      );
      if (maleVoice) return maleVoice;
    }

    // Default 'aura': Warm, friendly, natural female/neural voice
    const preferredAura = [
      'Google UK English Female',
      'Samantha (Enhanced)',
      'Samantha',
      'Microsoft Jenny Online (Natural)',
      'Ava (Premium)',
      'Ava',
      'Google US English',
      'Victoria',
      'Karen (Enhanced)',
      'Karen',
    ];

    for (const name of preferredAura) {
      const match = voices.find(v => v.name.includes(name));
      if (match) return match;
    }

    const naturalEn = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Enhanced') || v.name.includes('Premium')));
    if (naturalEn) return naturalEn;

    return voices.find(v => v.lang.startsWith('en')) || voices[0];
  };

  // Helper to speak text aloud with emotional inflection and natural cadence
  const speakText = (rawText) => {
    if (!voiceEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      // Clean up technical specs and numbers into natural human phrasing
      const clean = rawText
        .replace(/[*#_`\[\]()]/g, '')
        .replace(/₹\s?(\d+),?(\d+)?/g, (_, p1, p2) => `₹${p1}${p2 || ''}`)
        .replace(/₹/g, 'Rupees ')
        .replace(/\b5G\b/gi, 'Five G')
        .replace(/\bANC\b/gi, 'Active Noise Cancellation')
        .replace(/\bTWS\b/gi, 'True Wireless')
        .replace(/\bGaN\b/gi, 'Gallium Nitride')
        .replace(/\bMRP\b/gi, 'Retail Price')
        .replace(/\bOIS\b/gi, 'Optical Image Stabilization')
        .replace(/\bAMOLED\b/gi, 'Amoled')
        .slice(0, 240);

      const utterance = new SpeechSynthesisUtterance(clean);
      const chosenVoice = getBestVoice(selectedVoicePersona);
      if (chosenVoice) {
        utterance.voice = chosenVoice;
        utterance.lang = chosenVoice.lang;
      }

      // Modulation for warmth, emotion, and human conversational rhythm
      if (selectedVoicePersona === 'aura') {
        utterance.pitch = 1.08; // friendly, warm & lively
        utterance.rate = 1.0;
      } else if (selectedVoicePersona === 'kavya') {
        utterance.pitch = 1.04;
        utterance.rate = 0.98;
      } else {
        utterance.pitch = 0.98;
        utterance.rate = 1.02;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        // Hands-free continuous loop: resume listening in Live Voice Mode
        if (liveVoiceModeRef.current) {
          setTimeout(() => {
            if (liveVoiceModeRef.current) {
              startListening();
            }
          }, 600);
        }
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
      setIsSpeaking(false);
    }
  };

  // Start speech recognition with automatic silence detection & auto-send
  const startListening = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Voice speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = selectedLanguage;

      transcriptBufferRef.current = '';

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += piece;
          } else {
            interimTranscript += piece;
          }
        }
        const currentText = (finalTranscript || interimTranscript).trim();
        if (currentText) {
          transcriptBufferRef.current = currentText;
          setInputText(currentText);

          // Reset silence debounce timer: automatically send after 1.1s of silence!
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (transcriptBufferRef.current) {
              const toSend = transcriptBufferRef.current;
              transcriptBufferRef.current = '';
              try { rec.stop(); } catch (e) {}
              setIsListening(false);
              if (handleSendRef.current) {
                handleSendRef.current(toSend);
              }
            }
          }, 1100);
        }
      };

      rec.onerror = (e) => {
        console.warn('Speech recognition error:', e);
        setIsListening(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      };

      rec.onend = () => {
        setIsListening(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        // If there was captured speech that hasn't fired yet, dispatch it immediately!
        if (transcriptBufferRef.current) {
          const toSend = transcriptBufferRef.current;
          transcriptBufferRef.current = '';
          if (handleSendRef.current) {
            handleSendRef.current(toSend);
          }
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  // Toggle voice recognition manually
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setIsListening(false);
      // Dispatch immediately on manual stop if text present
      if (transcriptBufferRef.current && handleSendRef.current) {
        const toSend = transcriptBufferRef.current;
        transcriptBufferRef.current = '';
        handleSendRef.current(toSend);
      }
      return;
    }
    startListening();
  };

  // Toggle Live Hands-free Voice Mode
  const toggleLiveVoiceMode = () => {
    if (liveVoiceMode) {
      setLiveVoiceMode(false);
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setIsListening(false);
      setIsSpeaking(false);
    } else {
      setLiveVoiceMode(true);
      setVoiceEnabled(true);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      startListening();
    }
  };

  const quickPrompts = selectedLanguage === 'hi-IN' ? [
    '📱 20k ke andar best mobile',
    '🎧 Noise cancellation headphones dikhao',
    '⚡ 65W charger ke saath bundle discount do',
    '💳 Razorpay checkout par chalo',
  ] : [
    '📱 Best mobile under 20k',
    '🎧 Find wireless headphones with ANC under ₹8,000',
    '⚡ Get me the best bundle deal on charging accessories',
    '💳 Proceed to Razorpay checkout',
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    const userMsg = { role: 'user', text };
    const historyPayload = messages.map(m => ({ role: m.role, text: m.text }));
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const response = await sendChatMessage(
        text,
        'sess_buyer_chat',
        cartItems.map(it => ({ product_id: it.id, quantity: it.quantity })),
        historyPayload
      );

      const assistantMsg = {
        role: 'assistant',
        text: response.reply,
        action: response.action,
        actionPayload: response.action_payload,
        reasoning: response.reasoning,
        guardrailStatus: response.guardrail_status,
        cognitiveTrace: response.cognitive_trace,
      };

      setMessages(prev => [...prev, assistantMsg]);
      speakText(response.voice_summary || response.reply);

      // Emit pipeline event for AgentPipelineVisualization
      if (onAgentEvent) {
        onAgentEvent({
          action: response.action,
          actionPayload: response.action_payload,
          reasoning: response.reasoning,
          guardrailStatus: response.guardrail_status,
          timestamp: Date.now(),
        });
      }

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

  useEffect(() => {
    handleSendRef.current = handleSend;
  });

  if (!isOpen) return null;

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
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#0C83FE', background: '#EFF6FF', padding: '2px 6px', borderRadius: '4px', border: '1px solid #DBEAFE' }}>GEMINI 3.5 FLASH</span>
              </div>
              <span style={{ fontSize: '11px', color: '#64748B' }}>
                Conversational In-App Checkout
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Language Switcher */}
            <select
              value={selectedLanguage}
              onChange={(e) => {
                setSelectedLanguage(e.target.value);
                if (recognitionRef.current) {
                  try { recognitionRef.current.abort(); } catch (err) {}
                }
                if (window.speechSynthesis) window.speechSynthesis.cancel();
              }}
              title="Regional Language Selection (English / Hindi / Hinglish)"
              style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '6px',
                padding: '4px 6px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#166534',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="en-IN">🇬🇧 English</option>
              <option value="hi-IN">🇮🇳 हिन्दी / Hinglish</option>
            </select>

            {/* Voice Persona Selector */}
            <select
              value={selectedVoicePersona}
              onChange={(e) => {
                setSelectedVoicePersona(e.target.value);
                if (window.speechSynthesis) window.speechSynthesis.cancel();
              }}
              title="Select AI Voice Personality"
              style={{
                background: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                padding: '4px 6px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#1E293B',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="aura">🎙️ Aura (Warm)</option>
              <option value="kavya">🎙️ Kavya (Indian)</option>
              <option value="ryan">🎙️ Ryan (Tech)</option>
            </select>

            {/* Live Hands-Free Voice Mode Toggle */}
            <button
              type="button"
              onClick={toggleLiveVoiceMode}
              title={liveVoiceMode ? "Click to exit hands-free voice mode" : "Click for hands-free continuous voice conversation (like ChatGPT Voice / Gemini Live)"}
              style={{
                background: liveVoiceMode ? 'linear-gradient(135deg, #059669, #10B981)' : '#F1F5F9',
                border: '1px solid',
                borderColor: liveVoiceMode ? '#059669' : '#CBD5E1',
                borderRadius: '6px',
                padding: '5px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 700,
                color: liveVoiceMode ? '#FFFFFF' : '#334155',
                boxShadow: liveVoiceMode ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {liveVoiceMode ? <Sparkles size={12} color="#FFF" /> : <Mic size={12} />}
              {liveVoiceMode ? 'Live ON' : '⚡ Live Voice'}
            </button>

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
        </div>

        {/* Live Voice Conversation Orb HUD */}
        {(liveVoiceMode || isListening || isSpeaking) && (
          <div style={{
            margin: '10px 16px 0',
            padding: '10px 14px',
            background: isListening 
              ? 'linear-gradient(135deg, #064E3B 0%, #065F46 100%)' 
              : isSpeaking 
                ? 'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)'
                : 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            borderRadius: '12px',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 8px 20px -4px rgba(0, 0, 0, 0.25)',
            border: isListening ? '1px solid #10B981' : isSpeaking ? '1px solid #818CF8' : '1px solid #334155',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: isListening ? '#10B981' : isSpeaking ? '#818CF8' : '#38BDF8',
                  opacity: 0.35,
                  animation: 'ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite',
                }} />
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: isListening ? '#10B981' : isSpeaking ? '#6366F1' : '#0EA5E9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isListening ? '0 0 10px #10B981' : isSpeaking ? '0 0 10px #6366F1' : 'none',
                }}>
                  {isListening ? <Mic size={11} color="#FFF" /> : isSpeaking ? <Volume2 size={11} color="#FFF" /> : <Sparkles size={11} color="#FFF" />}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 800 }}>
                    {isListening 
                      ? (selectedLanguage === 'hi-IN' ? 'Aura sun rahi hai...' : 'Aura is listening...') 
                      : isSpeaking 
                        ? (selectedLanguage === 'hi-IN' ? 'Aura bol rahi hai...' : 'Aura is speaking...') 
                        : isTyping 
                          ? (selectedLanguage === 'hi-IN' ? 'Aura soch rahi hai...' : 'Aura is computing...') 
                          : 'Hands-free Voice Active'}
                  </span>
                  <span style={{ fontSize: '8.5px', background: 'rgba(255,255,255,0.18)', padding: '1px 5px', borderRadius: '6px', fontWeight: 700 }}>
                    {selectedLanguage === 'hi-IN' ? '🇮🇳 हिन्दी / Hinglish' : '🇬🇧 English'}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.75)', marginTop: '1px' }}>
                  {isListening 
                    ? (selectedLanguage === 'hi-IN' ? 'Boliye — chup hone par khud bhej degi' : 'Speak naturally — auto-sends on pause') 
                    : isSpeaking 
                      ? (selectedLanguage === 'hi-IN' ? 'Rokne ke liye Stop dabayein' : 'Continuous conversation mode') 
                      : 'Hands-free listening loop'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isSpeaking && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.speechSynthesis) window.speechSynthesis.cancel();
                    setIsSpeaking(false);
                  }}
                  style={{
                    background: 'rgba(239, 68, 68, 0.25)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    color: '#FCA5A5',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Stop ⏹️
                </button>
              )}
              {liveVoiceMode && (
                <button
                  type="button"
                  onClick={() => toggleLiveVoiceMode()}
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: 'none',
                    color: '#FFFFFF',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Exit ✕
                </button>
              )}
            </div>
          </div>
        )}

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

                {/* Product Cards for SHOW_PRODUCTS or referenced products */}
                {msg.role === 'assistant' && (() => {
                  const targetIds = [
                    ...(msg.actionPayload?.product_ids || []),
                    ...(msg.actionPayload?.product_id ? [msg.actionPayload.product_id] : [])
                  ];
                  const textLower = (msg.text || '').toLowerCase();
                  const matchedProducts = (products || []).filter(p => {
                    if (targetIds.includes(p.id)) return true;
                    const pNameLower = p.name.toLowerCase();
                    if (textLower.includes(pNameLower)) return true;
                    if (p.category === 'Smartphones' && (textLower.includes('nexus neo') || textLower.includes('smartphone') || textLower.includes('mobile') || textLower.includes('phone'))) return true;
                    if (p.category === 'Audio' && (textLower.includes('aura pro') || textLower.includes('anc headphone') || textLower.includes('spatial earbud') || textLower.includes('aura pods'))) return true;
                    if (p.category === 'Wearables' && (textLower.includes('nova chrono') || textLower.includes('smartwatch'))) return true;
                    if (p.category === 'Power' && (textLower.includes('magcharge') || textLower.includes('wireless dock') || textLower.includes('gan charger'))) return true;
                    return false;
                  }).slice(0, 2);

                  if (matchedProducts.length === 0) return null;

                  return (
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {matchedProducts.map((prod) => {
                        const isInCart = cartItems?.some(it => it.id === prod.id);
                        return (
                          <div
                            key={prod.id}
                            style={{
                              background: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              borderRadius: '8px',
                              padding: '10px',
                              display: 'flex',
                              gap: '10px',
                              alignItems: 'center',
                            }}
                          >
                            <img
                              src={prod.image_url || productPlaceholder(prod.name, prod.category)}
                              alt={prod.name}
                              onError={(e) => handleImageError(e, prod.name, prod.category)}
                              style={{
                                width: '56px',
                                height: '56px',
                                borderRadius: '6px',
                                objectFit: 'cover',
                                flexShrink: 0,
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                <span className="pill-badge pill-dark" style={{ fontSize: '9px', padding: '1px 5px' }}>
                                  {prod.category}
                                </span>
                              </div>
                              <h4 style={{
                                fontSize: '12px',
                                fontWeight: 700,
                                color: '#0C2340',
                                marginBottom: '2px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                                {prod.name}
                              </h4>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '6px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0C2340' }}>
                                  ₹{prod.price_inr.toLocaleString('en-IN')}
                                </span>
                                {prod.mrp_inr > prod.price_inr && (
                                  <span style={{ fontSize: '11px', color: '#94A3B8', textDecoration: 'line-through' }}>
                                    ₹{prod.mrp_inr.toLocaleString('en-IN')}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => onAddToCartById(prod.id)}
                                disabled={isInCart}
                                style={{
                                  width: '100%',
                                  padding: '5px 10px',
                                  borderRadius: '5px',
                                  border: 'none',
                                  background: isInCart ? '#DCFCE7' : '#0C83FE',
                                  color: isInCart ? '#15803D' : '#FFFFFF',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: isInCart ? 'default' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '5px',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                {isInCart ? (
                                  <>
                                    <CheckCircle2 size={12} color="#15803D" />
                                    <span>Added to Cart</span>
                                  </>
                                ) : (
                                  <>
                                    <ShoppingCart size={12} />
                                    <span>Add to Cart</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Guardrail & Action Card */}
                {msg.role === 'assistant' && (msg.action || msg.guardrailStatus || msg.reasoning) && (
                  <div style={{
                    marginTop: '10px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '11px',
                  }}>
                    {/* Action + Guardrail status row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {msg.action && msg.action !== 'NONE' && (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: '#DBEAFE',
                            color: '#1D4ED8',
                            fontWeight: 700,
                            fontSize: '10px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}>
                            <Zap size={10} /> {msg.action}
                          </span>
                        )}
                        {msg.guardrailStatus && (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: msg.guardrailStatus === 'PASSED' ? '#DCFCE7' : '#FEE2E2',
                            color: msg.guardrailStatus === 'PASSED' ? '#166534' : '#991B1B',
                            fontWeight: 700,
                            fontSize: '10px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}>
                            {msg.guardrailStatus === 'PASSED' ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />}
                            {msg.guardrailStatus}
                          </span>
                        )}
                      </div>

                      {/* Deep Cognitive Trace Toggle Button */}
                      {msg.cognitiveTrace && (
                        <button
                          type="button"
                          onClick={() => setExpandedTraceIndex(expandedTraceIndex === idx ? null : idx)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            background: expandedTraceIndex === idx ? '#1E293B' : '#EDF2F7',
                            color: expandedTraceIndex === idx ? '#38BDF8' : '#475569',
                            border: '1px solid',
                            borderColor: expandedTraceIndex === idx ? '#38BDF8' : '#CBD5E1',
                            borderRadius: '5px',
                            fontSize: '10px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <Terminal size={10} />
                          {expandedTraceIndex === idx ? 'Hide Agent Brain' : '🧠 Inspect Agent Brain'}
                          {expandedTraceIndex === idx ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                        </button>
                      )}
                    </div>

                    {/* Reasoning trace summary */}
                    {msg.reasoning && (
                      <div style={{
                        fontSize: '10px',
                        color: '#64748B',
                        lineHeight: 1.5,
                        fontFamily: 'var(--font-mono)',
                        borderTop: '1px dashed #E2E8F0',
                        paddingTop: '6px',
                      }}>
                        🔍 {msg.reasoning}
                      </div>
                    )}

                    {/* Expanded 5-Phase Deep Cognitive Trace */}
                    {expandedTraceIndex === idx && msg.cognitiveTrace && (
                      <div style={{
                        marginTop: '10px',
                        padding: '12px',
                        background: '#0B132B',
                        color: '#E2E8F0',
                        borderRadius: '8px',
                        border: '1px solid #1E293B',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        lineHeight: 1.5,
                        animation: 'fadeIn 0.25s ease-out',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1E293B', paddingBottom: '8px', marginBottom: '10px' }}>
                          <span style={{ color: '#38BDF8', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Terminal size={12} /> AGENT COGNITIVE TRACE (CHAIN-OF-THOUGHT)
                          </span>
                          <span style={{ fontSize: '9px', background: '#0F766E', color: '#5EEAD4', padding: '1px 6px', borderRadius: '3px' }}>
                            FINTECH CONSTRAINTS SOLVED
                          </span>
                        </div>

                        {/* Phase 1: Semantic Intent */}
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ color: '#94A3B8', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>
                            1. Semantic Intent & Context
                          </div>
                          <div style={{ background: '#172554', padding: '6px 8px', borderRadius: '4px', fontSize: '10px', color: '#93C5FD' }}>
                            Action: <strong style={{ color: '#FFFFFF' }}>{msg.cognitiveTrace.intent_analysis?.detected_action}</strong> | Intent: <strong style={{ color: '#FFFFFF' }}>{msg.cognitiveTrace.intent_analysis?.shopper_intent}</strong> | Reference Resolved: <strong style={{ color: '#34D399' }}>✓ Yes</strong>
                          </div>
                        </div>

                        {/* Phase 2: Unit Economics */}
                        {msg.cognitiveTrace.unit_economics && (
                          <div style={{ marginBottom: '10px' }}>
                            <div style={{ color: '#94A3B8', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>
                              2. Unit Economics & Merchant Margin Math
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', textAlign: 'center' }}>
                              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '4px' }}>
                                <div style={{ fontSize: '8px', color: '#94A3B8' }}>LIST PRICE</div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#F1F5F9' }}>
                                  ₹{msg.cognitiveTrace.unit_economics.list_price_inr?.toLocaleString('en-IN')}
                                </div>
                              </div>
                              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '4px' }}>
                                <div style={{ fontSize: '8px', color: '#94A3B8' }}>COST PRICE</div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#F87171' }}>
                                  ₹{msg.cognitiveTrace.unit_economics.cost_price_inr?.toLocaleString('en-IN')}
                                </div>
                              </div>
                              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '4px' }}>
                                <div style={{ fontSize: '8px', color: '#94A3B8' }}>GROSS MARGIN</div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#34D399' }}>
                                  {msg.cognitiveTrace.unit_economics.gross_margin_percent}%
                                </div>
                              </div>
                              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '4px' }}>
                                <div style={{ fontSize: '8px', color: '#94A3B8' }}>MAX DISCOUNT</div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#FBBF24' }}>
                                  {msg.cognitiveTrace.unit_economics.max_negotiable_discount_percent}%
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Phase 3: Guardrail Matrix */}
                        {msg.cognitiveTrace.guardrail_matrix && (
                          <div style={{ marginBottom: '10px' }}>
                            <div style={{ color: '#94A3B8', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>
                              3. Financial Guardrail Matrix (5 Bounds Evaluated)
                            </div>
                            <div style={{ border: '1px solid #1E293B', borderRadius: '4px', overflow: 'hidden' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                                <thead>
                                  <tr style={{ background: '#1E293B', color: '#94A3B8', textAlign: 'left' }}>
                                    <th style={{ padding: '4px 6px' }}>RULE</th>
                                    <th style={{ padding: '4px 6px' }}>THRESHOLD</th>
                                    <th style={{ padding: '4px 6px' }}>EVALUATED</th>
                                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>VERDICT</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {msg.cognitiveTrace.guardrail_matrix.map((row, rIdx) => (
                                    <tr key={rIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                      <td style={{ padding: '4px 6px', color: '#E2E8F0' }}>{row.rule_name}</td>
                                      <td style={{ padding: '4px 6px', color: '#94A3B8' }}>{row.threshold}</td>
                                      <td style={{ padding: '4px 6px', color: '#38BDF8' }}>{row.evaluated_value}</td>
                                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                                        <span style={{
                                          padding: '1px 5px',
                                          borderRadius: '3px',
                                          background: row.status === 'PASSED' || row.status === 'AUTONOMOUS_APPROVED' ? '#064E3B' : '#7F1D1D',
                                          color: row.status === 'PASSED' || row.status === 'AUTONOMOUS_APPROVED' ? '#34D399' : '#FCA5A5',
                                          fontSize: '8px',
                                          fontWeight: 700,
                                        }}>
                                          {row.status}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Phase 4: Strategy & Audit Link */}
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '4px', fontSize: '10px' }}>
                          <div style={{ color: '#94A3B8', fontSize: '8px', textTransform: 'uppercase', marginBottom: '2px' }}>
                            4. Game-Theoretic Convergence
                          </div>
                          <div style={{ color: '#CBD5E1', fontSize: '9px', marginBottom: '6px' }}>
                            {msg.cognitiveTrace.game_theory_strategy}
                          </div>

                          {/* Phase 5: Cryptographic Hash */}
                          {msg.cognitiveTrace.audit_hash && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed #1E293B', paddingTop: '6px' }}>
                              <span style={{ fontSize: '9px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Hash size={10} /> SHA-256 Audit #{msg.cognitiveTrace.audit_sequence}:
                                <span style={{ color: '#FCD34D' }}>{msg.cognitiveTrace.audit_hash.substring(0, 16)}...</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(msg.cognitiveTrace.audit_hash);
                                  setCopiedHash(msg.cognitiveTrace.audit_hash);
                                  setTimeout(() => setCopiedHash(null), 2000);
                                }}
                                style={{
                                  background: copiedHash === msg.cognitiveTrace.audit_hash ? '#065F46' : '#1E293B',
                                  color: copiedHash === msg.cognitiveTrace.audit_hash ? '#34D399' : '#94A3B8',
                                  border: 'none',
                                  borderRadius: '3px',
                                  padding: '2px 6px',
                                  fontSize: '8px',
                                  cursor: 'pointer',
                                }}
                              >
                                {copiedHash === msg.cognitiveTrace.audit_hash ? '✓ Copied' : 'Copy Hash'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              animation: 'messageSlideIn 0.3s ease-out',
            }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '6px',
                background: 'linear-gradient(135deg, #8B5CF6, #0C83FE)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Sparkles size={14} color="#FFFFFF" />
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0D121F', marginBottom: '2px' }}>
                  Gemini reasoning
                </div>
                <div className="typing-dots">
                  <span /><span /><span />
                </div>
              </div>
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
            style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                isListening 
                  ? (selectedLanguage === 'hi-IN' ? "🎙️ Sun raha hoon... boliye (khud send hoga)..." : "🎙️ Listening... speak now (auto-sends on pause)...")
                  : (selectedLanguage === 'hi-IN' ? "Boliye ya type kijiye (jaise: 20k me mobile dikhao)..." : "Ask anything or negotiate bundle deals...")
              }
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                background: isListening ? '#FEF2F2' : '#F8FAFC',
                border: '1px solid',
                borderColor: isListening ? '#EF4444' : '#CBD5E1',
                color: '#0C2340',
                fontSize: '14px',
                outline: 'none',
                transition: 'all 0.2s ease',
              }}
            />
            {/* Mic Toggle Button */}
            <button
              type="button"
              onClick={toggleListening}
              title={isListening ? "Listening... (auto-sends on pause, or click to send now)" : "Speak aloud (Auto-sends when you finish talking)"}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: isListening ? '#EF4444' : '#CBD5E1',
                background: isListening ? '#FEE2E2' : '#F8FAFC',
                color: isListening ? '#DC2626' : '#0C83FE',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isListening ? '0 0 12px rgba(239, 68, 68, 0.4)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              type="submit"
              className="btn-rzp-primary"
              style={{ padding: '10px 16px', borderRadius: '8px' }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
