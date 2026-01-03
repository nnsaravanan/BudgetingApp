import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import IncomeCard from './components/IncomeCard';
import StatsCards from './components/StatsCards';
import TransactionForm from './components/TransactionForm';
import TransactionList from './components/TransactionList';

const App = () => {
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

  const handleIncomeChange = (e) => {
    const value = e.target.value;
    setBiweeklyIncome(value);
    try {
      localStorage.setItem('biweekly-income', value);
    } catch (error) {
      console.error('Failed to save income:', error);
    }
  };

  const handleTransactionChange = (field, value) => {
    setNewTransaction(prev => ({
      ...prev,
      [field]: value
    }));
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
    setTransactions(updated);
    
    try {
      localStorage.setItem('transactions', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save transactions:', error);
    }
    
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
      setTransactions(updated);
      
      try {
        localStorage.setItem('transactions', JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save transactions:', error);
      }
    }
  };

  // Calculated values
  const monthlyIncome = biweeklyIncome ? (parseFloat(biweeklyIncome) * 26) / 12 : 0;
  const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
  const remaining = monthlyIncome - totalSpent;

  return (
    <div className="bg-light min-vh-100 py-5">
      <div className="container" style={{maxWidth: '900px'}}>
        <div className="card shadow-lg border-0 rounded-4">
          <Header />

          <div className="card-body p-5">
            <IncomeCard 
              biweeklyIncome={biweeklyIncome}
              onIncomeChange={handleIncomeChange}
              monthlyIncome={monthlyIncome}
            />

            <StatsCards 
              monthlyIncome={monthlyIncome}
              totalSpent={totalSpent}
              remaining={remaining}
            />

            <TransactionForm 
              newTransaction={newTransaction}
              onTransactionChange={handleTransactionChange}
              onAddTransaction={handleAddTransaction}
              categories={categories}
            />

            <TransactionList 
              transactions={transactions}
              onDeleteTransaction={handleDeleteTransaction}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;