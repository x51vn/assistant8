-- ===================================
-- English Learning Table Schema
-- ===================================

-- Create `english` table for storing English learning history
CREATE TABLE IF NOT EXISTS public.english (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one entry per chat_id per user
  UNIQUE(user_id, chat_id)
);

-- Create indexes for performance
CREATE INDEX idx_english_user_created 
  ON public.english(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.english ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own data
CREATE POLICY "Users can view own english" ON public.english
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own english" ON public.english
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own english" ON public.english
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own english" ON public.english
  FOR DELETE USING (auth.uid() = user_id);

-- Sample data (for testing)
-- INSERT INTO public.english (user_id, chat_id, topic, prompt)
-- SELECT auth.uid(), 'c_test_123', 'Thời tiết', 'Hỏi ChatGPT về thời tiết hôm nay'
-- WHERE auth.uid() IS NOT NULL;
