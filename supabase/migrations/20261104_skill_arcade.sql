-- ============================================================================
-- INTERVEXA.AI — SKILL ARCADE SCHEMA & RLS POLICIES
-- Integrates with challenge_profiles for unified XP, Streaks, and Badges
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.skill_arcade_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  unlocked_levels JSONB NOT NULL DEFAULT '{
    "code_hunter": ["Beginner"],
    "brain_battle": ["Beginner"],
    "memory_match": ["Beginner"],
    "logic_detective": ["Beginner"],
    "interview_simulator": ["Beginner"]
  }'::jsonb,
  personal_bests JSONB NOT NULL DEFAULT '{}'::jsonb,
  arcade_badges JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.skill_arcade_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id TEXT NOT NULL UNIQUE,
  tx_id TEXT UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL CHECK (game_id IN ('code_hunter', 'brain_battle', 'memory_match', 'logic_detective', 'interview_simulator')),
  level TEXT NOT NULL CHECK (level IN ('Beginner', 'Intermediate', 'Advanced', 'Expert')),
  category TEXT NOT NULL,
  skill_tag TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  accuracy INTEGER NOT NULL DEFAULT 0 CHECK (accuracy >= 0 AND accuracy <= 100),
  correct_count INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 1,
  completion_time_seconds INTEGER NOT NULL DEFAULT 1,
  qualified BOOLEAN NOT NULL DEFAULT FALSE,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  missed_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  local_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_arcade_attempts_user_date
  ON public.skill_arcade_attempts(user_id, completed_at DESC);

ALTER TABLE public.skill_arcade_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_arcade_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own skill arcade progress"
  ON public.skill_arcade_progress
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own skill arcade attempts"
  ON public.skill_arcade_attempts
  FOR SELECT
  USING (auth.uid() = user_id);
