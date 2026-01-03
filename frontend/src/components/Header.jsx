import React from 'react';

const Header = ({user, onSignOut}) => {
    return (
        <div
            className="card-header bg-gradient text-black py-4"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          >
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <h1 className="mb-0 fw-bold">Budget Tracker</h1>
                <p className="mb-0 mt-2 opacity-75">Track your spending, stay on budget</p>
              </div>
              <div className="text-end">
                <small className="d-block mb-2 opacity-75">{user?.email}</small>
                <button onClick={onSignOut} className="btn btn-sm btn-light">
                  Sign Out
                </button>
              </div>
            </div>
          </div>
    );
};

export default Header;