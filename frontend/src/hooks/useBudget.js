import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const API_URL = 'http://localhost:5000/api';

export const useBudget = (user) => {
  const [biweeklyIncome, setBiweeklyIncome] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Get auth headers with JWT token
  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`
    };
  };

  // Load initial data when user logs in
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  // Fetch income and transactions from backend
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = await getAuthHeaders();

      // Fetch income and transactions in parallel
      const [incomeRes, txRes] = await Promise.all([
        fetch(`${API_URL}/income`, { headers }),
        fetch(`${API_URL}/transactions`, { headers })
      ]);

      if (incomeRes.ok) {
        const incomeData = await incomeRes.json();
        setBiweeklyIncome(incomeData.biweekly_income.toString());
      } else {
        console.error('Failed to fetch income:', await incomeRes.text());
      }

      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData);
      } else {
        console.error('Failed to fetch transactions:', await txRes.text());
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Update income in database
  const updateIncome = async (value) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/income`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ biweekly_income: parseFloat(value) })
      });

      if (!res.ok) {
        throw new Error('Failed to update income');
      }

      setBiweeklyIncome(value);
      return true;
    } catch (err) {
      console.error('Failed to update income:', err);
      setError(err.message);
      return false;
    }
  };

  // Add new transaction to database
  const addTransaction = async (transaction) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/transactions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: parseFloat(transaction.amount),
          description: transaction.description,
          category: transaction.category,
          date: transaction.date
        })
      });

      if (!res.ok) {
        throw new Error('Failed to add transaction');
      }

      const newTx = await res.json();
      setTransactions([newTx, ...transactions]);
      return newTx;
    } catch (err) {
      console.error('Failed to add transaction:', err);
      setError(err.message);
      throw err;
    }
  };

  // Delete transaction from database
  const deleteTransaction = async (id) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/transactions/${id}`, {
        method: 'DELETE',
        headers
      });

      if (!res.ok) {
        throw new Error('Failed to delete transaction');
      }

      setTransactions(transactions.filter(t => t.id !== id));
      return true;
    } catch (err) {
      console.error('Failed to delete transaction:', err);
      setError(err.message);
      return false;
    }
  };

  // Calculate derived values
  const monthlyIncome = biweeklyIncome ? (parseFloat(biweeklyIncome) * 26) / 12 : 0;
  const totalSpent = transactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  const remaining = monthlyIncome - totalSpent;

  return {
    biweeklyIncome,
    transactions,
    loading,
    error,
    monthlyIncome,
    totalSpent,
    remaining,
    updateIncome,
    addTransaction,
    deleteTransaction,
    refetch: loadData
  };
};