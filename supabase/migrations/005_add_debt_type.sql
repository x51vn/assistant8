-- Migration: Add debt/liability support to assets
-- Ticket: XST-703
-- Description: Add 'debt' asset type for tracking loans and liabilities

-- ============================================
-- Update: Add 'debt' to asset_type constraint
-- ============================================

-- Drop old constraint
ALTER TABLE public.assets 
DROP CONSTRAINT IF EXISTS assets_type_check;

-- Add new constraint with 'debt' included
ALTER TABLE public.assets 
ADD CONSTRAINT assets_type_check 
CHECK (asset_type IN ('cash', 'savings', 'real_estate', 'crypto', 'gold', 'vehicle', 'debt', 'other'));

COMMENT ON COLUMN public.assets.asset_type IS 'Type of asset: cash, savings, real_estate, crypto, gold, vehicle, debt (liabilities), other';
