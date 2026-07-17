import React, { useState, useEffect } from 'react';
import { 
  CreditCard, Zap, Check, Calendar, 
  ArrowRight, Download, AlertTriangle, RefreshCw, FileText
} from '../components/icons';
import apiClient from '../api/client';
import NavigationBar from '../components/NavigationBar';

const BillingPage = () => {
  const [usage, setUsage] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    try {
      const [usageRes, invoicesRes] = await Promise.all([
        apiClient.get('/users/me/usage'),
        apiClient.get('/users/me/invoices')
      ]);
      setUsage(usageRes.data);
      setInvoices(invoicesRes.data);
    } catch (err) {
      setError('Failed to load billing data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getUsageData = () => {
    if (!usage) return { qUsed: 0, qLimit: 100, dUsed: 0, dLimit: 10, sUsed: 0, sLimit: 100, plan: 'free' };
    return {
      qUsed: usage.queries_used ?? usage.queriesUsed ?? 0,
      qLimit: usage.queries_limit ?? usage.queriesLimit ?? 100,
      dUsed: usage.documents_used ?? usage.documentsUsed ?? 0,
      dLimit: usage.documents_limit ?? usage.documentsLimit ?? 10,
      sUsed: usage.storage_used_mb ?? usage.storageUsed ?? 0,
      sLimit: usage.storage_limit_mb ?? usage.storageLimit ?? 100,
      plan: usage.plan || 'free'
    };
  };

  const usagePercent = (used, limit) => {
    if (limit >= 999999 || limit === Infinity) return 0;
    return Math.min((used / (limit || 1)) * 100, 100);
  };

  const plans = [
    {
      id: 'free', name: 'Free', price: '$0', period: '/month',
      description: 'Get started with Lexis RAG intelligence',
      features: ['100 queries / month', '10 document uploads', '100 MB vector storage', 'Standard AI models', 'Community support'],
      cta: 'Current Plan', disabled: true
    },
    {
      id: 'pro', name: 'Pro Specialist', price: '$19', period: '/month',
      description: 'Designed for active researchers & practitioners',
      features: ['2,000 queries / month', '100 document uploads', '5 GB vector storage', 'Priority deep-indexing', 'Custom model selection'],
      cta: 'Upgrade to Pro', disabled: false, highlighted: true
    },
    {
      id: 'team', name: 'Enterprise Team', price: '$49', period: '/user/month',
      description: 'Collaborative AI knowledge base for teams',
      features: ['Unlimited queries', 'Unlimited document storage', '50 GB shared storage', 'SSO & SAML Security', 'Dedicated vector cluster', '24/7 Priority Support'],
      cta: 'Contact Sales', disabled: false
    }
  ];

  const u = getUsageData();

  if (loading) {
    return (
      <div className="app-layout">
        <NavigationBar />
        <main className="main-content page-container">
          <div className="page-header-title">
            <h1 className="page-title">Usage & Subscription</h1>
            <p className="page-subtitle">Track resource quotas, select plans, and manage invoicing.</p>
          </div>
          <div className="billing-grid-container">
            <div className="glass-panel usage-card skeleton" style={{ height: 140 }} />
            <div className="glass-panel usage-card skeleton" style={{ height: 140 }} />
            <div className="glass-panel usage-card skeleton" style={{ height: 140 }} />
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-layout">
        <NavigationBar />
        <main className="main-content page-container">
          <div className="glass-panel error-card-box">
            <AlertTriangle className="icon-lg text-danger" />
            <h3>Billing Data Unavailable</h3>
            <p>{error}</p>
            <button className="btn primary-btn mt-4" onClick={fetchBillingData}>
              <RefreshCw className="icon-sm" />
              <span>Retry Loading</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <NavigationBar />

      <main className="main-content page-container">
        {/* Page Header */}
        <div className="page-header-title">
          <h1 className="page-title">Usage & Subscription</h1>
          <p className="page-subtitle">
            Monitor real-time consumption limits, upgrade tier plans, and download past invoices.
          </p>
        </div>

        {/* Usage Overview Grid */}
        <div className="billing-usage-grid">
          <UsageMetricCard
            icon={<Zap className="icon text-accent" />}
            label="Queries Consumed"
            used={u.qUsed}
            limit={u.qLimit}
            percent={usagePercent(u.qUsed, u.qLimit)}
          />
          <UsageMetricCard
            icon={<FileText className="icon text-accent" />}
            label="Documents Indexed"
            used={u.dUsed}
            limit={u.dLimit}
            percent={usagePercent(u.dUsed, u.dLimit)}
          />
          <UsageMetricCard
            icon={<CreditCard className="icon text-accent" />}
            label="Vector Storage"
            used={u.sUsed}
            limit={u.sLimit}
            percent={usagePercent(u.sUsed, u.sLimit)}
            unit="MB"
          />
        </div>

        {/* Subscription Tier Cards */}
        <div className="billing-plans-section">
          <div className="section-title-box">
            <h2>Select Membership Plan</h2>
            <p className="text-secondary">Scale vector indexing and model inference as your workflow expands.</p>
          </div>

          <div className="plans-grid-three">
            {plans.map(p => {
              const isCurrent = u.plan === p.id;
              return (
                <div 
                  key={p.id} 
                  className={`glass-panel plan-tier-card ${p.highlighted ? 'highlighted-plan' : ''} ${isCurrent ? 'current-plan' : ''}`}
                >
                  {p.highlighted && <span className="tier-pill badge-popular">MOST POPULAR</span>}
                  {isCurrent && <span className="tier-pill badge-current">CURRENT TIER</span>}
                  
                  <h3 className="plan-name">{p.name}</h3>
                  <div className="plan-price-row">
                    <span className="price-val">{p.price}</span>
                    <span className="period-lbl">{p.period}</span>
                  </div>
                  <p className="plan-description">{p.description}</p>
                  
                  <ul className="plan-feature-list">
                    {p.features.map((f, i) => (
                      <li key={i} className="feature-item">
                        <Check className="icon-xs text-accent" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <button 
                    type="button"
                    className={`btn plan-action-btn ${isCurrent ? 'outline-btn disabled' : p.highlighted ? 'primary-btn' : 'outline-btn'}`}
                    disabled={isCurrent || p.disabled}
                    onClick={() => alert(`Upgrading to ${p.name} tier plan...`)}
                  >
                    <span>{isCurrent ? 'Current Active Plan' : p.cta}</span>
                    {!isCurrent && <ArrowRight className="icon-xs" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Invoice Statements Table */}
        {invoices.length > 0 && (
          <div className="billing-invoices-section mt-6">
            <div className="section-title-box">
              <h2>Invoice Statements</h2>
            </div>
            <div className="glass-panel invoices-table-container">
              <div className="invoice-row header-row">
                <span>Date</span>
                <span>Description</span>
                <span>Amount</span>
                <span>Status</span>
                <span className="text-right">Receipt</span>
              </div>
              {invoices.map(inv => (
                <div key={inv.id} className="invoice-row">
                  <span className="invoice-date">
                    {new Date(inv.date).toLocaleDateString()}
                  </span>
                  <span className="invoice-desc">{inv.description}</span>
                  <span className="invoice-amount">{inv.amount}</span>
                  <span>
                    <span className={`status-pill status-${inv.status}`}>{inv.status}</span>
                  </span>
                  <div className="text-right">
                    <button 
                      type="button"
                      className="btn-icon text-btn"
                      title="Download Invoice PDF"
                    >
                      <Download className="icon-sm" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const UsageMetricCard = ({ icon, label, used, limit, percent, unit = '' }) => (
  <div className="glass-panel usage-metric-card">
    <div className="usage-metric-header">
      {icon}
      <span className="usage-metric-label">{label}</span>
    </div>
    <div className="usage-progress-track">
      <div 
        className="usage-progress-bar" 
        style={{ width: `${percent}%` }}
      />
    </div>
    <div className="usage-metric-footer">
      <span className="usage-value-text">
        <strong>{used}</strong>{unit} of {limit >= 999999 || limit === Infinity ? 'Unlimited' : `${limit}${unit}`}
      </span>
      <span className="usage-percent-text">{Math.round(percent)}%</span>
    </div>
  </div>
);

export default BillingPage;
