import React from 'react';

const Header = () => {
    return (
        <div
            className="card-header bg-gradient text-white py-4"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
        >
            <h1 className="mb-0 fw-bold text-black">Budget Tracker</h1>
            <p className="mb-0 mt-2 opacity-75 text-black">Track your spending, stay on budget</p>
        </div>
    );
};

export default Header;