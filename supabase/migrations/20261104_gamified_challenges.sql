-- =============================================================================
-- INTERVEXA.AI - STEP 3: GAMIFIED INTERVIEW CHALLENGES SCHEMA & RLS MIGRATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.challenge_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Candidate',
  leaderboard_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  current_level INTEGER NOT NULL DEFAULT 1 CHECK (current_level >= 1),
  current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  last_completed_date DATE,
  best_score NUMERIC(4,1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.challenge_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id TEXT NOT NULL UNIQUE,
  tx_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard', 'Expert')),
  score NUMERIC(4,1) NOT NULL CHECK (score >= 0 AND score <= 10),
  xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  is_daily_challenge BOOLEAN NOT NULL DEFAULT FALSE,
  local_date DATE NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.challenge_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, badge_id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.challenge_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_badges ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile OR opted-in profiles for the leaderboard
CREATE POLICY "Read own or opted-in leaderboard profiles"
  ON public.challenge_profiles
  FOR SELECT
  USING (auth.uid() = user_id OR leaderboard_opt_in = TRUE);

-- Users can only update their own leaderboard_opt_in & display_name (XP is server-controlled via service_role)
CREATE POLICY "Read own challenge attempts"
  ON public.challenge_attempts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Read own unlocked badges"
  ON public.challenge_badges
  FOR SELECT
  USING (auth.uid() = user_id);
