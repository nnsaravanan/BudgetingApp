import React from 'react';

const StatsCards = ({ monthlyIncome, totalSpent, remaining }) => {
  return (
    <div className="row g-4 mb-5">
      <div className="col-md-4">
        <div 
          className="card border-0 shadow-sm h-100" 
          style={{background: 'linear-gradient(135deg, #84fab015 0%, #8fd3f425 100%)'}}
        >
          <div className="card-body p-4 text-center">
            <h6 className="text-success mb-2 fw-semibold">Monthly Budget</h6>
            <h2 className="mb-0 fw-bold text-success">${monthlyIncome.toFixed(2)}</h2>
          </div>
        </div>
      </div>

      <div className="col-md-4">
        <div 
          className="card border-0 shadow-sm h-100" 
          style={{background: 'linear-gradient(135deg, #fa709a15 0%, #fee14025 100%)'}}
        >
          <div className="card-body p-4 text-center">
            <h6 className="text-danger mb-2 fw-semibold">Total Spent</h6>
            <h2 className="mb-0 fw-bold text-danger">${totalSpent.toFixed(2)}</h2>
          </div>
        </div>
      </div>

      <div className="col-md-4">
        <div 
          className={`card border-0 shadow-sm h-100 ${remaining >= 0 ? 'bg-success' : 'bg-warning'} bg-opacity-10`}
        >
          <div className="card-body p-4 text-center">
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
  );
};

export default StatsCards;