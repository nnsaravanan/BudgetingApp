import React from 'react';

const IncomeCard = ({ biweeklyIncome, onIncomeChange, monthlyIncome }) => {
  return (
    <div 
      className="card border-0 shadow-sm mb-4" 
      style={{background: 'linear-gradient(135deg, #667eea15 0%, #764ba215 100%)'}}
    >
      <div className="card-body p-4">
        <label className="form-label fw-bold text-dark mb-3">Biweekly Income</label>
        <div className="input-group input-group-lg">
          <span className="input-group-text bg-white border-2">$</span>
          <input
            type="number"
            className="form-control border-2"
            value={biweeklyIncome}
            onChange={onIncomeChange}
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
  );
};

export default IncomeCard;