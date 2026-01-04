import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useBudget } from '../hooks/useBudget';
import IncomeCard from '../components/IncomeCard';
import StatsCards from '../components/StatsCards';
import TransactionForm from '../components/TransactionForm';
import TransactionList from '../components/TransactionList';
import Header from '../components/Header';

const BudgetPage = () => {
  const { user, signOut } = useAuth();
  const {
    biweeklyIncome: savedBiweeklyIncome,
    transactions,
    loading,
    error,
    updateIncome,
    addTransaction,
    deleteTransaction
  } = useBudget(user);

  // Local state for income (changes immediately in UI)
  const [localBiweeklyIncome, setLocalBiweeklyIncome] = useState('');
  
  // Sync local state with saved income when it loads
  useState(() => {
    if (savedBiweeklyIncome) {
      setLocalBiweeklyIncome(savedBiweeklyIncome);
    }
  }, [savedBiweeklyIncome]);

  const [newTransaction, setNewTransaction] = useState({
    amount: '',
    description: '',
    category: 'Food',
    date: new Date().toISOString().split('T')[0]
  });

  const categories = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Healthcare', 'Other'];

  // Calculate monthly income from LOCAL state (for instant UI update)
  const monthlyIncome = localBiweeklyIncome ? (parseFloat(localBiweeklyIncome) * 26) / 12 : 0;
  const totalSpent = transactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  const remaining = monthlyIncome - totalSpent;

  // Handle input change - updates LOCAL state only (UI updates instantly)
  const handleIncomeChange = (e) => {
    const value = e.target.value;
    setLocalBiweeklyIncome(value);
  };

  // Handle save button click - saves to database
  const handleSaveIncome = async () => {
    if (!localBiweeklyIncome) {
      alert('Please enter an income amount');
      return;
    }

    try {
      await updateIncome(localBiweeklyIncome);
      alert('Income saved successfully!');
    } catch (err) {
      alert('Failed to save income. Please try again.');
    }
  };

  const handleTransactionChange = (field, value) => {
    setNewTransaction(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAddTransaction = async () => {
    if (!newTransaction.amount || !newTransaction.description) {
      alert('Please fill in amount and description');
      return;
    }

    try {
      await addTransaction(newTransaction);
      
      // Reset form on success
      setNewTransaction({
        amount: '',
        description: '',
        category: 'Food',
        date: new Date().toISOString().split('T')[0]
      });
    } catch (err) {
      alert('Failed to add transaction. Please try again.');
    }
  };

  const handleDeleteTransaction = async (id) => {
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      const success = await deleteTransaction(id);
      if (!success) {
        alert('Failed to delete transaction. Please try again.');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <div className="alert alert-danger" role="alert">
          <h4 className="alert-heading">Error loading data</h4>
          <p>{error}</p>
          <button className="btn btn-danger" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-light min-vh-100 py-5">
      <div className="container" style={{ maxWidth: '900px' }}>
        <div className="card shadow-lg border-0 rounded-4">
          <Header user={user} onSignOut={signOut} />

          <div className="card-body p-5">
            <IncomeCard
              biweeklyIncome={localBiweeklyIncome}
              onIncomeChange={handleIncomeChange}
              onSaveIncome={handleSaveIncome}
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

export default BudgetPage;