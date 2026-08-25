import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import StorefrontView from './components/Storefront/StorefrontView';
import CartDrawer from './components/Storefront/CartDrawer';
import DynamicUpsellModal from './components/Storefront/DynamicUpsellModal';
import ProductSpecsModal from './components/Storefront/ProductSpecsModal';
import BuyerChatDrawer from './components/ConversationalBuyer/BuyerChatDrawer';
import PaymentLauncher from './components/Checkout/PaymentLauncher';
import ApprovalPendingModal from './components/Checkout/ApprovalPendingModal';
import GrowthCockpit from './components/MerchantDashboard/GrowthCockpit';
import SafetyAuditView from './components/SafetyAndAudit/SafetyAuditView';
import ResilienceLabView from './components/ResilienceLab/ResilienceLabView';
import ProtocolInspectorView from './components/ProtocolInspector/ProtocolInspectorView';

import { fetchCatalog, evaluateDynamicOffer, createOrder, fetchHealth } from './services/api';

export default function App() {
  // One id per browser session, so audit traces and approvals are per-shopper.
  const [sessionId] = useState(() => `sess_${Math.random().toString(36).slice(2, 10)}`);
  const [activeTab, setActiveTab] = useState('storefront');
  const [products, setProducts] = useState([]);
  const [health, setHealth] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Cart & Discount State
  const [cartItems, setCartItems] = useState([]);
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Assistant & Modals State
  const [isAiBuyerOpen, setIsAiBuyerOpen] = useState(false);
  const [specsProduct, setSpecsProduct] = useState(null);
  const [activeUpsellOffer, setActiveUpsellOffer] = useState(null);
  const [activeRazorpayOrder, setActiveRazorpayOrder] = useState(null);
  const [gatedOrder, setGatedOrder] = useState(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Load Catalog
  useEffect(() => {
    async function loadCatalog() {
      try {
        const prods = await fetchCatalog();
        setProducts(prods);
      } catch (err) {
        console.error('Failed to fetch storefront catalog:', err);
      } finally {
        setLoadingProducts(false);
      }
    }
    loadCatalog();
    // The footer reports what is actually wired up rather than a fixed
    // list of logos, so it never claims an LLM or a database that is absent.
    fetchHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  // Cart Operations
  const handleAddToCart = async (product) => {
    setCartItems(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });

    showToast(`Added ${product.name} to cart`);

    // Autonomously evaluate growth upsell offer
    try {
      const updatedCart = [...cartItems, { product_id: product.id, quantity: 1, price_inr: product.price_inr }];
      const subtotal = updatedCart.reduce((sum, it) => sum + (it.price_inr * (it.quantity || 1)), 0);
      const offer = await evaluateDynamicOffer(sessionId, updatedCart, subtotal, 'cart_view');
      
      if (offer.offer_available && !cartItems.some(it => it.id === offer.recommended_product_id)) {
        setTimeout(() => {
          setActiveUpsellOffer(offer);
        }, 600);
      }
    } catch (err) {
      console.log('Dynamic offer check completed.');
    }
  };

  const handleAddToCartById = (productId) => {
    const prod = products.find(p => p.id === productId);
    if (prod) handleAddToCart(prod);
  };

  const handleUpdateQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      handleRemoveItem(productId);
      return;
    }
    setCartItems(prev =>
      prev.map(item => (item.id === productId ? { ...item, quantity: newQuantity } : item))
    );
  };

  const handleRemoveItem = (productId) => {
    setCartItems(prev => prev.filter(item => item.id !== productId));
  };

  const handleApplyDiscount = (discountPct, reason, escalated = false) => {
    const subtotal = cartItems.reduce((sum, it) => sum + (it.price_inr * it.quantity), 0);
    const amount = (subtotal * discountPct) / 100;
    setAppliedDiscount(amount);
    setDiscountReason(reason || `${discountPct}% agentic promotion`);
    showToast(
      escalated
        ? `${discountPct}% requested — the merchant decides at checkout.`
        : `Applied ${discountPct}% agent discount.`
    );
  };

  const handleAcceptUpsell = (offer) => {
    const recommendedProd = products.find(p => p.id === offer.recommended_product_id);
    if (recommendedProd) {
      setCartItems(prev => [
        ...prev,
        { ...recommendedProd, quantity: 1, is_upsell: true },
      ]);
      setAppliedDiscount(prev => prev + offer.discount_amount_inr);
      setDiscountReason(`⚡ ${offer.offer_title} (${offer.discount_percent}% off bundle)`);
      showToast(`Added ${recommendedProd.name} with bundle discount!`);
    }
    setActiveUpsellOffer(null);
  };

  const handleProceedToCheckout = async (discountOverrideInr = null) => {
    if (cartItems.length === 0) return;
    setIsCreatingOrder(true);

    const discountToRequest =
      typeof discountOverrideInr === 'number' ? discountOverrideInr : appliedDiscount;

    try {
      const orderPayload = {
        items: cartItems.map(it => ({
          product_id: it.id,
          quantity: it.quantity,
          is_upsell: Boolean(it.is_upsell),
        })),
        customer_email: 'shopper@example.com',
        customer_phone: '9876543210',
        applied_discount_inr: discountToRequest,
        discount_rationale: discountReason || 'Standard direct checkout',
        is_agent_assisted: discountToRequest > 0,
        agent_type: discountToRequest > 0 ? 'growth_agent' : 'organic',
        session_id: sessionId,
      };

      const orderRes = await createOrder(orderPayload);
      setIsCartOpen(false);
      setIsAiBuyerOpen(false);

      // A discount past the approval gate books no order — a human decides first.
      if (orderRes.status === 'pending_approval') {
        setGatedOrder(orderRes);
        showToast('Discount held for merchant approval — nothing charged.');
      } else {
        setActiveRazorpayOrder(orderRes);
      }
    } catch (err) {
      showToast('Order creation error: ' + err.message);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // The merchant approved: resume the original checkout with the authorized amount.
  const handleApprovalGranted = (outcome) => {
    setGatedOrder(null);
    setActiveRazorpayOrder({
      order_id: outcome.order_id,
      razorpay_order_id: outcome.razorpay_order_id,
      amount_inr: outcome.amount_inr,
      amount_paise: outcome.amount_paise,
      currency: outcome.currency || 'INR',
      razorpay_key_id: outcome.razorpay_key_id,
      discount_inr: outcome.discount_applied_inr,
      is_mock: outcome.is_mock,
      session_id: sessionId,
    });
    showToast('Merchant approved the discount — resuming checkout.');
  };

  // Declined or not worth the wait: retry at the discount the agent can grant alone.
  const handleApprovalDeclined = (autoApplicableInr) => {
    setGatedOrder(null);
    setAppliedDiscount(autoApplicableInr);
    setDiscountReason('Authorized agent discount (merchant approval not granted)');
    handleProceedToCheckout(autoApplicableInr);
  };

  const handlePaymentSuccess = (verifyResult) => {
    const onLiveRails = health?.razorpay_mode === 'razorpay_test_mode';
    setActiveRazorpayOrder(null);
    setCartItems([]);
    setAppliedDiscount(0);
    setDiscountReason('');
    showToast(
      onLiveRails
        ? '🎉 Payment captured on Razorpay test rails.'
        : '🎉 Signature verified and order captured (simulated rail).'
    );
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#F8FAFC' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 10000,
          background: '#0C2340',
          color: '#FFFFFF',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 10px 30px rgba(12, 35, 64, 0.25)',
          borderLeft: '4px solid #0C83FE',
          fontSize: '14px',
          fontWeight: 600,
          animation: 'fadeIn 0.2s ease-out',
        }}>
          {toastMessage}
        </div>
      )}

      {/* Global Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        cartCount={cartItems.reduce((sum, it) => sum + it.quantity, 0)}
        openCart={() => setIsCartOpen(true)}
        openAiBuyer={() => setIsAiBuyerOpen(true)}
      />

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        {activeTab === 'storefront' && (
          <StorefrontView
            products={products}
            loading={loadingProducts}
            onAddToCart={handleAddToCart}
            onOpenSpecs={(p) => setSpecsProduct(p)}
            onOpenAiBuyer={() => setIsAiBuyerOpen(true)}
          />
        )}

        {activeTab === 'growth' && <GrowthCockpit />}

        {activeTab === 'safety' && <SafetyAuditView />}

        {activeTab === 'resilience' && <ResilienceLabView />}

        {activeTab === 'protocol' && <ProtocolInspectorView />}
      </main>

      {/* Slide-out Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        appliedDiscount={appliedDiscount}
        discountReason={discountReason}
        onProceedToCheckout={handleProceedToCheckout}
        isCreatingOrder={isCreatingOrder}
      />

      {/* Conversational AI Shopping Assistant */}
      <BuyerChatDrawer
        isOpen={isAiBuyerOpen}
        onClose={() => setIsAiBuyerOpen(false)}
        cartItems={cartItems}
        onAddToCartById={handleAddToCartById}
        onApplyDiscount={handleApplyDiscount}
        onTriggerCheckout={handleProceedToCheckout}
      />

      {/* Dynamic Upsell Popup */}
      <DynamicUpsellModal
        offer={activeUpsellOffer}
        onAccept={handleAcceptUpsell}
        onDecline={() => setActiveUpsellOffer(null)}
      />

      {/* Product Specs Detail Modal */}
      <ProductSpecsModal
        product={specsProduct}
        onClose={() => setSpecsProduct(null)}
        onAddToCart={handleAddToCart}
      />

      {/* Approval gate: shown while a merchant rules on a held discount */}
      {gatedOrder && (
        <ApprovalPendingModal
          gatedOrder={gatedOrder}
          onApproved={handleApprovalGranted}
          onRejected={handleApprovalDeclined}
          onClose={() => setGatedOrder(null)}
        />
      )}

      {/* Payment: real Razorpay Checkout, or a labelled simulation without keys */}
      <PaymentLauncher
        orderData={activeRazorpayOrder}
        sessionId={sessionId}
        customer={{ email: 'shopper@example.com', phone: '9876543210' }}
        onClose={() => setActiveRazorpayOrder(null)}
        onPaymentSuccess={handlePaymentSuccess}
      />

      {/* Official Razorpay Footer */}
      <footer style={{
        background: '#0C2340',
        color: '#94A3B8',
        borderTop: '1px solid #1E3A8A',
        padding: '36px 32px',
        fontSize: '13px',
      }}>
        <div style={{
          maxWidth: '1440px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', marginBottom: '4px' }}>
              Razor<span style={{ color: '#0C83FE' }}>pay</span> Agentic OS
            </div>
            <div>Built for the Razorpay AI Challenge 2026 • Track 01: AI Growth & Agentic Commerce</div>
          </div>
          <div style={{ display: 'flex', gap: '20px', color: '#CBD5E1', fontWeight: 600, flexWrap: 'wrap' }}>
            <span>
              Razorpay ·{' '}
              {health
                ? health.razorpay_mode === 'razorpay_test_mode'
                  ? 'test mode'
                  : 'simulation (no keys)'
                : '…'}
            </span>
            <span>ACP / AP2-aligned</span>
            <span>{health ? (health.gemini_active ? 'Gemini active' : 'Gemini inactive — heuristic engine') : '…'}</span>
            <span>{health ? (health.db === 'supabase_postgres' ? 'Supabase Postgres' : 'SQLite') : '…'}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
