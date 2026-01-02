import React, { useState, useEffect } from 'react';

const SimpleBudgetApp = () => {
  const [biweeklyIncome, setBiweeklyIncome] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [newTransaction, setNewTransaction] = useState({
    amount: '',
    description: '',
    category: 'Food',
    date: new Date().toISOString().split('T')[0]
  });

  const categories = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Healthcare', 'Other'];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    try {
      const savedIncome = localStorage.getItem('biweekly-income');
      if (savedIncome) {
        setBiweeklyIncome(savedIncome);
      }

      const savedTransactions = localStorage.getItem('transactions');
      if (savedTransactions) {
        setTransactions(JSON.parse(savedTransactions));
      }
    } catch (error) {
      console.log('No saved data yet');
    }
  };

  const saveIncome = (income) => {
    try {
      localStorage.setItem('biweekly-income', income);
      setBiweeklyIncome(income);
    } catch (error) {
      console.error('Failed to save income:', error);
    }
  };

  const saveTransactions = (txns) => {
    try {
      localStorage.setItem('transactions', JSON.stringify(txns));
      setTransactions(txns);
    } catch (error) {
      console.error('Failed to save transactions:', error);
    }
  };

  const handleIncomeChange = (e) => {
    const value = e.target.value;
    saveIncome(value);
  };

  const handleAddTransaction = () => {
    if (!newTransaction.amount || !newTransaction.description) {
      alert('Please fill in amount and description');
      return;
    }

    const transaction = {
      id: Date.now(),
      amount: parseFloat(newTransaction.amount),
      description: newTransaction.description,
      category: newTransaction.category,
      date: newTransaction.date
    };

    const updated = [transaction, ...transactions];
    saveTransactions(updated);
    
    setNewTransaction({
      amount: '',
      description: '',
      category: 'Food',
      date: new Date().toISOString().split('T')[0]
    });
  };

  const handleDeleteTransaction = (id) => {
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      const updated = transactions.filter(t => t.id !== id);
      saveTransactions(updated);
    }
  };

  const monthlyIncome = biweeklyIncome ? (parseFloat(biweeklyIncome) * 26) / 12 : 0;
  const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
  const remaining = monthlyIncome - totalSpent;

  return (
    <div className="bg-light min-vh-100 py-5">
      <div className="container" style={{maxWidth: '900px'}}>
        <div className="card shadow-lg border-0 rounded-4">
          <div className="card-header bg-gradient text-white py-4" style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}>
            <h1 className="mb-0 fw-bold">
              💰 Budget Tracker
            </h1>
            <p className="mb-0 mt-2 opacity-75">Track your spending, stay on budget</p>
          </div>

          <div className="card-body p-5">
            {/* Income Section */}
            <div className="card border-0 shadow-sm mb-4" style={{background: 'linear-gradient(135deg, #667eea15 0%, #764ba215 100%)'}}>
              <div className="card-body p-4">
                <label className="form-label fw-bold text-dark mb-3">💵 Biweekly Income</label>
                <div className="input-group input-group-lg">
                  <span className="input-group-text bg-white border-2">$</span>
                  <input
                    type="number"
                    className="form-control border-2"
                    value={biweeklyIncome}
                    onChange={handleIncomeChange}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
                <div className="mt-3 p-3 bg-white rounded">
                  <small className="text-muted">Monthly Income:</small>
                  <h5 className="mb-0 fw-bold text-dark">${monthlyIncome.toFixed(2)}</h5>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="row g-4 mb-5">
              <div className="col-md-4">
                <div className="card border-0 shadow-sm h-100" style={{background: 'linear-gradient(135deg, #84fab015 0%, #8fd3f425 100%)'}}>
                  <div className="card-body p-4 text-center">
                    <div className="mb-2">📊</div>
                    <h6 className="text-success mb-2 fw-semibold">Monthly Budget</h6>
                    <h2 className="mb-0 fw-bold text-success">${monthlyIncome.toFixed(2)}</h2>
                  </div>
                </div>
              </div>

              <div className="col-md-4">
                <div className="card border-0 shadow-sm h-100" style={{background: 'linear-gradient(135deg, #fa709a15 0%, #fee14025 100%)'}}>
                  <div className="card-body p-4 text-center">
                    <div className="mb-2">💸</div>
                    <h6 className="text-danger mb-2 fw-semibold">Total Spent</h6>
                    <h2 className="mb-0 fw-bold text-danger">${totalSpent.toFixed(2)}</h2>
                  </div>
                </div>
              </div>

              <div className="col-md-4">
                <div className={`card border-0 shadow-sm h-100 ${remaining >= 0 ? 'bg-success' : 'bg-warning'} bg-opacity-10`}>
                  <div className="card-body p-4 text-center">
                    <div className="mb-2">{remaining >= 0 ? '✅' : '⚠️'}</div>
                    <h6 className={`mb-2 fw-semibold ${remaining >= 0 ? 'text-success' : 'text-warning'}`}>
                      Remaining
                    </h6>
                    <h2 className={`mb-0 fw-bold ${remaining >= 0 ? 'text-success' : 'text-warning'}`}>
                      ${Math.abs(remaining).toFixed(2)}
                    </h2>
                    {remaining < 0 && (
                      <small className="text-warning d-block mt-2">Over budget!</small>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Add Transaction Form */}
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-header text-white py-3" style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}>
                <h5 className="mb-0 fw-semibold">➕ Add Transaction</h5>
              </div>
              <div className="card-body p-4">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Amount</label>
                    <input
                      type="number"
                      className="form-control"
                      value={newTransaction.amount}
                      onChange={(e) => setNewTransaction({...newTransaction, amount: e.target.value})}
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={newTransaction.date}
                      onChange={(e) => setNewTransaction({...newTransaction, date: e.target.value})}
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label">Description</label>
                    <input
                      type="text"
                      className="form-control"
                      value={newTransaction.description}
                      onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
                      placeholder="What did you buy?"
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label">Category</label>
                    <select
                      className="form-select"
                      value={newTransaction.category}
                      onChange={(e) => setNewTransaction({...newTransaction, category: e.target.value})}
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-12">
                    <button
                      onClick={handleAddTransaction}
                      className="btn btn-lg w-100 text-white fw-semibold"
                      style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}
                    >
                      ➕ Add Transaction
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Transaction History */}
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white py-3 border-bottom">
                <h5 className="mb-0 fw-semibold">📋 Transaction History</h5>
              </div>
              <div className="card-body p-0">
                {transactions.length === 0 ? (
                  <div className="p-5 text-center text-muted">
                    <div className="mb-3" style={{fontSize: '3rem'}}>📝</div>
                    <p className="mb-0">No transactions yet. Add your first transaction above!</p>
                  </div>
                ) : (
                  <div className="list-group list-group-flush">
                    {transactions.map((transaction, index) => (
                      <div key={transaction.id} className="list-group-item py-3 px-4" style={{background: index % 2 === 0 ? '#ffffff' : '#f8f9fa'}}>
                        <div className="d-flex justify-content-between align-items-center">
                          <div className="flex-grow-1">
                            <h6 className="mb-2 fw-semibold">{transaction.description}</h6>
                            <div className="d-flex gap-2 flex-wrap align-items-center">
                              <span className="badge rounded-pill" style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}>{transaction.category}</span>
                              <small className="text-muted">
                                📅 {new Date(transaction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </small>
                            </div>
                          </div>
                          <div className="text-end ms-3">
                            <h5 className="text-danger mb-2 fw-bold">-${transaction.amount.toFixed(2)}</h5>
                            <button
                              onClick={() => handleDeleteTransaction(transaction.id)}
                              className="btn btn-sm btn-outline-danger rounded-pill"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleBudgetApp;