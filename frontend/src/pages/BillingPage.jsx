import React, { useState, useEffect } from 'react';
import { 
  CreditCard, Zap, Check, Calendar, 
  ArrowRight, Download, AlertTriangle, RefreshCw 
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
      description: 'Get started with Lexis',
      features: ['100 queries/month', '10 documents', '100 MB storage', 'Community support'],
      cta: 'Current Plan', disabled: true
    },
    {
      id: 'pro', name: 'Pro', price: '$19', period: '/month',
      description: 'For power users',
      features: ['2,000 queries/month', '100 documents', '5 GB storage', 'Priority support', 'Custom models'],
      cta: 'Upgrade to Pro', disabled: false, highlighted: true
    },
    {
      id: 'team', name: 'Team', price: '$49', period: '/user/month',
      description: 'For teams',
      features: ['Unlimited queries', 'Unlimited documents', '50 GB storage', 'SSO & SAML', 'Admin dashboard', 'API access'],
      cta: 'Contact Sales', disabled: false
    }
  ];

  const u = getUsageData();

  if (loading) {
    return (
      <div className="app-shell">
        <NavigationBar />
        <div className="page-shell">
          <div className="page-header-bar">
            <CreditCard className="icon" />
            <h1>BILLING</h1>
          </div>
          <div className="billing-usage-grid">
            {[1, 2, 3].map(i => (
              <div key={i} className="usage-card">
                <div className="skeleton-line" style={{ height: 80 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-shell">
        <NavigationBar />
        <div className="page-shell">
          <div className="page-header-bar">
            <CreditCard className="icon" />
            <h1>BILLING</h1>
          </div>
          <div className="profile-card error-state">
            <AlertTriangle className="icon-large" />
            <p>{error} <button onClick={fetchBillingData}>Retry</button></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <NavigationBar />
      <div className="page-shell">
        <div className="page-header-bar">
          <CreditCard className="icon" />
          <h1>BILLING</h1>
        </div>

        {/* Usage Overview */}
        <div className="billing-usage-grid">
          <UsageCard
            icon={<Zap className="icon" />}
            label="Queries"
            used={u.qUsed}
            limit={u.qLimit}
            percent={usagePercent(u.qUsed, u.qLimit)}
          />
          <UsageCard
            icon={<Calendar className="icon" />}
            label="Documents"
            used={u.dUsed}
            limit={u.dLimit}
            percent={usagePercent(u.dUsed, u.dLimit)}
          />
          <UsageCard
            icon={<Download className="icon" />}
            label="Storage"
            used={u.sUsed}
            limit={u.sLimit}
            percent={usagePercent(u.sUsed, u.sLimit)}
            unit="MB"
          />
        </div>

        {/* Plan Selection */}
        <div className="billing-plans">
          <h2>Choose Your Plan</h2>
          <div className="plans-grid">
            {plans.map(p => (
              <div 
                key={p.id} 
                className={`plan-card ${p.highlighted ? 'highlighted' : ''} ${u.plan === p.id ? 'current' : ''}`}
              >
                {p.highlighted && <span className="plan-badge-popular">POPULAR</span>}
                {u.plan === p.id && <span className="plan-badge-current">CURRENT</span>}
                
                <h3>{p.name}</h3>
                <div className="plan-price">
                  <span className="price">{p.price}</span>
                  <span className="period">{p.period}</span>
                </div>
                <p className="plan-desc">{p.description}</p>
                
                <ul className="plan-features">
                  {p.features.map((f, i) => (
                    <li key={i}><Check className="icon-small" />{f}</li>
                  ))}
                </ul>
                
                <button 
                  className={`plan-cta ${p.disabled ? 'disabled' : p.highlighted ? 'primary' : 'secondary'}`}
                  disabled={p.disabled}
                >
                  {p.cta}
                  {!p.disabled && <ArrowRight className="icon-small" />}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Invoice History */}
        {invoices.length > 0 && (
          <div className="billing-invoices">
            <h2>Invoice History</h2>
            <div className="invoice-list">
              {invoices.map(inv => (
                <div key={inv.id} className="invoice-row">
                  <span className="invoice-date">
                    {new Date(inv.date).toLocaleDateString()}
                  </span>
                  <span className="invoice-desc">{inv.description}</span>
                  <span className="invoice-amount">{inv.amount}</span>
                  <span className={`invoice-status status-${inv.status}`}>{inv.status}</span>
                  <button className="btn-ghost"><Download className="icon-small" /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const UsageCard = ({ icon, label, used, limit, percent, unit = '' }) => (
  <div className="usage-card">
    <div className="usage-header">
      {icon}
      <span>{label}</span>
    </div>
    <div className="usage-bar">
      <div 
        className="usage-fill" 
        style={{ width: `${percent}%` }}
      />
    </div>
    <span className="usage-text">
      {used}{unit} / {limit >= 999999 || limit === Infinity ? '∞' : `${limit}${unit}`}
    </span>
  </div>
);

export default BillingPage;
