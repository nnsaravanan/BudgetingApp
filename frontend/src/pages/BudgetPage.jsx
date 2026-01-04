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
    biweeklyIncome,
    transactions,
    loading,
    error,
    monthlyIncome,
    totalSpent,
    remaining,
    updateIncome,
    addTransaction,
    deleteTransaction
  } = useBudget(user);

  const [newTransaction, setNewTransaction] = useState({
    amount: '',
    description: '',
    category: 'Food',
    date: new Date().toISOString().split('T')[0]
  });

  const categories = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Healthcare', 'Other'];

  const handleIncomeChange = async (e) => {
    const value = e.target.value;
    if (value) {
      await updateIncome(value);
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

export default BudgetPage;