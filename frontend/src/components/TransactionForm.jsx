import React from 'react';

const TransactionForm = ({ 
  newTransaction, 
  onTransactionChange, 
  onAddTransaction, 
  categories 
}) => {
  return (
    <div className="card border-0 shadow-sm mb-4">
      <div 
        className="card-header text-white py-3" 
        style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}
      >
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
              onChange={(e) => onTransactionChange('amount', e.target.value)}
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
              onChange={(e) => onTransactionChange('date', e.target.value)}
            />
          </div>

          <div className="col-12">
            <label className="form-label">Description</label>
            <input
              type="text"
              className="form-control"
              value={newTransaction.description}
              onChange={(e) => onTransactionChange('description', e.target.value)}
              placeholder="What did you buy?"
            />
          </div>

          <div className="col-12">
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={newTransaction.category}
              onChange={(e) => onTransactionChange('category', e.target.value)}
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="col-12">
            <button
              onClick={onAddTransaction}
              className="btn btn-lg w-100 text-white fw-semibold"
              style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}
            >
              ➕ Add Transaction
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransactionForm;