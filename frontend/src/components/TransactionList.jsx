import React from 'react';

const TransactionList = ({ transactions, onDeleteTransaction }) => {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white py-3 border-bottom">
        <h5 className="mb-0 fw-semibold">Transaction History</h5>
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
              <div 
                key={transaction.id} 
                className="list-group-item py-3 px-4" 
                style={{background: index % 2 === 0 ? '#ffffff' : '#f8f9fa'}}
              >
                <div className="d-flex justify-content-between align-items-center">
                  <div className="flex-grow-1">
                    <h6 className="mb-2 fw-semibold">{transaction.description}</h6>
                    <div className="d-flex gap-2 flex-wrap align-items-center">
                      <span 
                        className="badge rounded-pill" 
                        style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}
                      >
                        {transaction.category}
                      </span>
                      <small className="text-muted">
                        📅 {new Date(transaction.date).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })}
                      </small>
                    </div>
                  </div>
                  <div className="text-end ms-3">
                    <h5 className="text-danger mb-2 fw-bold">
                      -${transaction.amount.toFixed(2)}
                    </h5>
                    <button
                      onClick={() => onDeleteTransaction(transaction.id)}
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
  );
};

export default TransactionList;