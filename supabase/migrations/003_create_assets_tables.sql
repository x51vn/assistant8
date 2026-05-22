-- Migration: Create assets and asset_history tables
-- Ticket: XST-695
-- Description: Asset Management tables for tracking user assets (cash, savings, crypto, gold, real estate, etc.)

-- ============================================
-- Table: assets
-- Stores individual asset records for users
-- ============================================
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  asset_type VARCHAR(50) NOT NULL, -- 'cash', 'savings', 'real_estate', 'crypto', 'gold', 'vehicle', 'other'
  quantity DECIMAL(20, 8) DEFAULT 1,
  unit_price DECIMAL(20, 2),
  current_value DECIMAL(20, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'VND',
  liquidity VARCHAR(20) DEFAULT 'medium', -- 'high', 'medium', 'low'
  risk_level VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'very_high'
  institution VARCHAR(255),
  account_number VARCHAR(100),
  maturity_date DATE,
  interest_rate DECIMAL(5, 2),
  location VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Constraints
  CONSTRAINT assets_type_check CHECK (asset_type IN ('cash', 'savings', 'real_estate', 'crypto', 'gold', 'vehicle', 'other')),
  CONSTRAINT assets_liquidity_check CHECK (liquidity IN ('high', 'medium', 'low')),
  CONSTRAINT assets_risk_check CHECK (risk_level IN ('low', 'medium', 'high', 'very_high')),
  CONSTRAINT assets_value_positive CHECK (current_value >= 0)
);

-- ============================================
-- Table: asset_history
-- Stores daily snapshots of total asset value
-- ============================================
CREATE TABLE IF NOT EXISTS asset_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_value DECIMAL(20, 2) NOT NULL,
  breakdown JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One snapshot per user per day
  UNIQUE(user_id, snapshot_date)
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(user_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_active ON assets(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_asset_history_user_date ON asset_history(user_id, snapshot_date DESC);

-- ============================================
-- Enable Row Level Security (RLS)
-- ============================================
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_history ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for assets table
-- ============================================
CREATE POLICY "Users can view own assets" 
  ON assets FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assets" 
  ON assets FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assets" 
  ON assets FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own assets" 
  ON assets FOR DELETE 
  USING (auth.uid() = user_id);

-- ============================================
-- RLS Policies for asset_history table
-- ============================================
CREATE POLICY "Users can view own asset history" 
  ON asset_history FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own asset history" 
  ON asset_history FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own asset history" 
  ON asset_history FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own asset history" 
  ON asset_history FOR DELETE 
  USING (auth.uid() = user_id);

-- ============================================
-- Function: Update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER assets_updated_at_trigger
  BEFORE UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION update_assets_updated_at();

-- ============================================
-- Rollback script (run manually if needed)
-- ============================================
-- DROP TRIGGER IF EXISTS assets_updated_at_trigger ON assets;
-- DROP FUNCTION IF EXISTS update_assets_updated_at();
-- DROP POLICY IF EXISTS "Users can delete own asset history" ON asset_history;
-- DROP POLICY IF EXISTS "Users can update own asset history" ON asset_history;
-- DROP POLICY IF EXISTS "Users can insert own asset history" ON asset_history;
-- DROP POLICY IF EXISTS "Users can view own asset history" ON asset_history;
-- DROP POLICY IF EXISTS "Users can delete own assets" ON assets;
-- DROP POLICY IF EXISTS "Users can update own assets" ON assets;
-- DROP POLICY IF EXISTS "Users can insert own assets" ON assets;
-- DROP POLICY IF EXISTS "Users can view own assets" ON assets;
-- DROP TABLE IF EXISTS asset_history;
-- DROP TABLE IF EXISTS assets;
