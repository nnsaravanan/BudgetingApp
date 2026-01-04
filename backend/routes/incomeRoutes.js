const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// GET /api/income - Get user's income
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware

    const { data, error } = await supabase
      .from('user_income')
      .select('*')
      .eq('user_id', userId)
      .single();

    // If no income record exists, create one with default value
    if (error && error.code === 'PGRST116') {
      const { data: newData, error: insertError } = await supabase
        .from('user_income')
        .insert([{ user_id: userId, biweekly_income: 0 }])
        .select()
        .single();

      if (insertError) throw insertError;
      return res.json(newData);
    }

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Get income error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/income - Update user's income
router.put('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { biweekly_income } = req.body;

    if (biweekly_income === undefined || biweekly_income === null) {
      return res.status(400).json({ error: 'biweekly_income is required' });
    }

    // Upsert (update if exists, insert if not)
    const { data, error } = await supabase
      .from('user_income')
      .upsert({
        user_id: userId,
        biweekly_income: parseFloat(biweekly_income),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Update income error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;