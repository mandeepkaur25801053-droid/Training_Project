import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { evaluateInterviewAnswer } from "./gemini.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const STORE_FILE = path.join(DATA_DIR, "gamification.json");

export const REWARDS_CONFIG = {
  xpByDifficulty: {
    Easy: 10,
    Medium: 20,
    Hard: 35,
    Expert: 50,
  },
  dailyChallengeBonusXp: 15,
  weeklyChallengeBonusXp: 75,
  passingScoreThreshold: 5.5,
  topScoreThreshold: 8.5,
};

export const LEVEL_TIERS = [
  { level: 1, title: "Beginner", minXp: 0, nextLevelXp: 50 },
  { level: 2, title: "Learner", minXp: 50, nextLevelXp: 120 },
  { level: 3, title: "Rising Talent", minXp: 120, nextLevelXp: 220 },
  { level: 4, title: "Skilled Candidate", minXp: 220, nextLevelXp: 360 },
  { level: 5, title: "Interview Ready", minXp: 360, nextLevelXp: 550 },
  { level: 6, title: "Advanced Contender", minXp: 550, nextLevelXp: 800 },
  { level: 7, title: "Principal Candidate", minXp: 800, nextLevelXp: 1100 },
];

export function calculateLevelProgress(totalXp) {
  const safeXp = Math.max(0, Math.floor(Number(totalXp) || 0));
  for (let i = LEVEL_TIERS.length - 1; i >= 0; i--) {
    const tier = LEVEL_TIERS[i];
    if (safeXp >= tier.minXp) {
      const span = Math.max(1, tier.nextLevelXp - tier.minXp);
      const intoLevel = safeXp - tier.minXp;
      const progressPercent = Math.min(100, Math.round((intoLevel / span) * 100));
      const xpNeededForNextLevel = Math.max(0, tier.nextLevelXp - safeXp);
      return {
        currentLevel: tier.level,
        levelTitle: tier.title,
        currentLevelMinXp: tier.minXp,
        nextLevelXp: tier.nextLevelXp,
        xpNeededForNextLevel,
        progressPercent,
      };
    }
  }
  return {
    currentLevel: 1,
    levelTitle: "Beginner",
    currentLevelMinXp: 0,
    nextLevelXp: 50,
    xpNeededForNextLevel: 50,
    progressPercent: 0,
  };
}

// Authoritative server registry of valid Challenge IDs & metadata
export const SERVER_CHALLENGE_REGISTRY = new Map([
  // Technical Challenges (13 topics)
  ["tech_prog_01", { id: "tech_prog_01", title: "Value vs. Reference & Memory Allocation", category: "Technical", subcategory: "Programming fundamentals", difficulty: "Easy", timeLimitSeconds: null, expectedKeywords: ["stack", "heap", "primitive", "reference", "mutation", "garbage collection"] }],
  ["tech_dsa_01", { id: "tech_dsa_01", title: "Sliding Window vs. Two Pointers Optimization", category: "Technical", subcategory: "Data structures and algorithms", difficulty: "Medium", timeLimitSeconds: null, expectedKeywords: ["sliding window", "two pointers", "time complexity", "O(n)", "subarray", "monotonic"] }],
  ["tech_js_01", { id: "tech_js_01", title: "Event Loop, Microtasks & Closure Scope", category: "Technical", subcategory: "JavaScript", difficulty: "Medium", timeLimitSeconds: null, expectedKeywords: ["call stack", "microtask", "macrotask", "promise", "closure", "lexical"] }],
  ["tech_py_01", { id: "tech_py_01", title: "Python GIL, Generators & Decorator Internals", category: "Technical", subcategory: "Python", difficulty: "Medium", timeLimitSeconds: null, expectedKeywords: ["GIL", "yield", "generator", "iterator", "decorator", "multiprocessing"] }],
  ["tech_java_01", { id: "tech_java_01", title: "JVM Memory Model, Garbage Collection & ConcurrentHashMap", category: "Technical", subcategory: "Java", difficulty: "Hard", timeLimitSeconds: null, expectedKeywords: ["heap", "G1GC", "volatile", "synchronized", "ConcurrentHashMap", "CAS"] }],
  ["tech_cpp_01", { id: "tech_cpp_01", title: "RAII, Smart Pointers & Virtual Dispatch Tables", category: "Technical", subcategory: "C++", difficulty: "Hard", timeLimitSeconds: null, expectedKeywords: ["RAII", "unique_ptr", "shared_ptr", "vtable", "destructor", "move semantics"] }],
  ["tech_sql_01", { id: "tech_sql_01", title: "Composite Indexing, Window Functions & Query Plans", category: "Technical", subcategory: "SQL", difficulty: "Medium", timeLimitSeconds: null, expectedKeywords: ["B-tree", "composite index", "ROW_NUMBER", "PARTITION BY", "EXPLAIN", "cardinality"] }],
  ["tech_react_01", { id: "tech_react_01", title: "React Reconciliation, Fiber & Render Optimization", category: "Technical", subcategory: "React", difficulty: "Medium", timeLimitSeconds: null, expectedKeywords: ["Fiber", "reconciliation", "keys", "useMemo", "state colocation", "batching"] }],
  ["tech_node_01", { id: "tech_node_01", title: "Node.js Libuv Thread Pool, Streams & Backpressure", category: "Technical", subcategory: "Node.js", difficulty: "Hard", timeLimitSeconds: null, expectedKeywords: ["libuv", "event loop", "streams", "backpressure", "worker threads", "non-blocking"] }],
  ["tech_os_01", { id: "tech_os_01", title: "Virtual Memory Paging, Deadlocks & Context Switching", category: "Technical", subcategory: "Operating systems", difficulty: "Hard", timeLimitSeconds: null, expectedKeywords: ["page table", "TLB", "page fault", "deadlock", "mutex", "semaphore"] }],
  ["tech_dbms_01", { id: "tech_dbms_01", title: "ACID Isolation Levels, MVCC & Write-Ahead Logging", category: "Technical", subcategory: "DBMS", difficulty: "Expert", timeLimitSeconds: null, expectedKeywords: ["ACID", "serializable", "MVCC", "WAL", "phantom read", "optimistic locking"] }],
  ["tech_net_01", { id: "tech_net_01", title: "TCP 3-Way Handshake, TLS 1.3 & HTTP/2 Multiplexing", category: "Technical", subcategory: "Computer networks", difficulty: "Medium", timeLimitSeconds: null, expectedKeywords: ["SYN", "ACK", "TLS", "HTTP/2", "multiplexing", "head-of-line blocking"] }],
  ["tech_aiml_01", { id: "tech_aiml_01", title: "Bias-Variance Trade-off, Regularization & Gradient Descent", category: "Technical", subcategory: "AI and machine learning", difficulty: "Hard", timeLimitSeconds: null, expectedKeywords: ["overfitting", "L1", "L2", "learning rate", "cross-validation", "regularization"] }],

  // HR Challenges (8 topics)
  ["hr_intro_01", { id: "hr_intro_01", title: "60-Second Executive Elevator Pitch", category: "HR", subcategory: "Self introduction", difficulty: "Easy", timeLimitSeconds: null, expectedKeywords: ["role", "impact", "experience", "project", "strengths", "goal"] }],
  ["hr_sw_01", { id: "hr_sw_01", title: "Articulating Authentic Strengths & Growth Areas", category: "HR", subcategory: "Strengths and weaknesses", difficulty: "Easy", timeLimitSeconds: null, expectedKeywords: ["strength", "improvement", "action", "feedback", "measurable", "learning"] }],
  ["hr_team_01", { id: "hr_team_01", title: "Cross-Functional Collaboration Under Tight Deadlines", category: "HR", subcategory: "Teamwork", difficulty: "Medium", timeLimitSeconds: null, expectedKeywords: ["situation", "task", "action", "result", "collaboration", "alignment"] }],
  ["hr_lead_01", { id: "hr_lead_01", title: "Leading Without Formal Authority (STAR)", category: "HR", subcategory: "Leadership", difficulty: "Medium", timeLimitSeconds: null, expectedKeywords: ["ownership", "initiative", "mentoring", "outcome", "team", "decision"] }],
  ["hr_conf_01", { id: "hr_conf_01", title: "Resolving Architectural or Product Disagreements", category: "HR", subcategory: "Conflict management", difficulty: "Medium", timeLimitSeconds: null, expectedKeywords: ["empathy", "data", "trade-offs", "compromise", "consensus", "result"] }],
  ["hr_prob_01", { id: "hr_prob_01", title: "Diagnosing an Ambiguous Production Outage", category: "HR", subcategory: "Problem-solving", difficulty: "Hard", timeLimitSeconds: null, expectedKeywords: ["root cause", "triage", "metrics", "mitigation", "postmortem", "prevention"] }],
  ["hr_comm_01", { id: "hr_comm_01", title: "Explaining Complex Technical Risk to Non-Technical Stakeholders", category: "HR", subcategory: "Communication", difficulty: "Medium", timeLimitSeconds: null, expectedKeywords: ["clarity", "business impact", "options", "recommendation", "stakeholder", "alignment"] }],
  ["hr_goal_01", { id: "hr_goal_01", title: "3-Year Engineering Trajectory & Role Alignment", category: "HR", subcategory: "Career goals", difficulty: "Easy", timeLimitSeconds: null, expectedKeywords: ["growth", "impact", "mentorship", "architecture", "contribution", "vision"] }],

  // AI and Future Skills (5 topics)
  ["ai_gen_01", { id: "ai_gen_01", title: "RAG Architecture vs. Fine-Tuning Trade-offs", category: "AI & Future Skills", subcategory: "Generative AI", difficulty: "Hard", timeLimitSeconds: null, expectedKeywords: ["retrieval", "embeddings", "vector", "hallucination", "context window", "latency"] }],
  ["ai_prompt_01", { id: "ai_prompt_01", title: "Structured Output & Few-Shot Prompt Engineering", category: "AI & Future Skills", subcategory: "Prompt engineering", difficulty: "Medium", timeLimitSeconds: null, expectedKeywords: ["schema", "few-shot", "system prompt", "validation", "deterministic", "guardrails"] }],
  ["ai_ml_01", { id: "ai_ml_01", title: "Precision, Recall, F1-Score & Imbalanced Datasets", category: "AI & Future Skills", subcategory: "Machine learning fundamentals", difficulty: "Medium", timeLimitSeconds: null, expectedKeywords: ["precision", "recall", "F1", "false positive", "ROC-AUC", "class imbalance"] }],
  ["ai_ethics_01", { id: "ai_ethics_01", title: "Algorithmic Fairness, PII Redaction & Explainable AI", category: "AI & Future Skills", subcategory: "AI ethics", difficulty: "Medium", timeLimitSeconds: null, expectedKeywords: ["bias", "privacy", "PII", "consent", "explainability", "audit"] }],
  ["ai_real_01", { id: "ai_real_01", title: "Designing a Low-Latency Production AI Copilot", category: "AI & Future Skills", subcategory: "Real-world AI applications", difficulty: "Expert", timeLimitSeconds: null, expectedKeywords: ["streaming", "caching", "fallback", "rate limit", "evaluation", "telemetry"] }],

  // Timed Challenges (5 formats)
  ["timed_30s_01", { id: "timed_30s_01", title: "30-Second Answer Challenge: REST vs. GraphQL", category: "Timed Challenges", subcategory: "30-second answer challenge", difficulty: "Easy", timeLimitSeconds: 30, expectedKeywords: ["overfetching", "underfetching", "caching", "schema", "endpoints"] }],
  ["timed_60s_01", { id: "timed_60s_01", title: "60-Second Technical Blitz: Database Sharding vs. Replication", category: "Timed Challenges", subcategory: "60-second technical challenge", difficulty: "Medium", timeLimitSeconds: 60, expectedKeywords: ["horizontal", "partition", "read replica", "shard key", "consistency"] }],
  ["timed_3m_01", { id: "timed_3m_01", title: "3-Minute Interview Challenge: Full STAR Production Incident", category: "Timed Challenges", subcategory: "3-minute interview challenge", difficulty: "Hard", timeLimitSeconds: 180, expectedKeywords: ["situation", "task", "action", "result", "metrics", "prevention"] }],
  ["timed_rapid_01", { id: "timed_rapid_01", title: "Rapid-Fire Trio: HTTP 401 vs 403, Debounce vs Throttle, SQL vs NoSQL", category: "Timed Challenges", subcategory: "Rapid-fire questions", difficulty: "Hard", timeLimitSeconds: 90, expectedKeywords: ["authentication", "authorization", "debounce", "throttle", "ACID", "scaling"] }],
  ["timed_code_01", { id: "timed_code_01", title: "Timed Coding Challenge: Valid Parentheses & Min-Stack Complexity", category: "Timed Challenges", subcategory: "Coding challenge", difficulty: "Expert", timeLimitSeconds: 300, expectedKeywords: ["stack", "O(1)", "push", "pop", "matching", "edge cases"] }],
]);

function ensureStoreFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    const initialData = {
      users: {},
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(initialData, null, 2), "utf8");
  }
}

function readStore() {
  ensureStoreFile();
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { users: {} };
  }
}

function writeStore(store) {
  ensureStoreFile();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

function getOrCreateUserRecord(store, userId, displayName = "Candidate") {
  if (!store.users[userId]) {
    store.users[userId] = {
      userId,
      displayName: String(displayName || "Candidate").slice(0, 80),
      leaderboardOptIn: true,
      totalXp: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastCompletedDate: null,
      activityCalendar: {}, // YYYY-MM-DD -> { count, xpEarned }
      completedChallenges: [], // { attemptId, txId, challengeId, category, subcategory, difficulty, score, xpAwarded, isDaily, completedAt, localDate }
      rewardedAttemptIds: [],
      xpHistory: [], // { txId, reason, xp, timestamp }
      unlockedBadges: {}, // badgeId -> { unlockedAt }
      bestScore: 0,
      improvedPersonalBestCount: 0,
    };
  } else if (displayName && displayName !== "Candidate") {
    store.users[userId].displayName = String(displayName).slice(0, 80);
  }
  return store.users[userId];
}

/**
 * Deterministic daily challenge selector seeded by YYYY-MM-DD local date string.
 * Ensures the user sees the exact same 3 Daily Challenges throughout that calendar day.
 */
export function getDeterministicDailyChallengeIds(localDateStr) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(localDateStr || ""))
    ? String(localDateStr)
    : new Date().toISOString().slice(0, 10);

  let hash = 2166136261;
  for (let i = 0; i < safeDate.length; i++) {
    hash ^= safeDate.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const seed = Math.abs(hash);

  const techIds = Array.from(SERVER_CHALLENGE_REGISTRY.values())
    .filter((c) => c.category === "Technical")
    .map((c) => c.id);
  const hrIds = Array.from(SERVER_CHALLENGE_REGISTRY.values())
    .filter((c) => c.category === "HR")
    .map((c) => c.id);
  const timedIds = Array.from(SERVER_CHALLENGE_REGISTRY.values())
    .filter((c) => c.category === "Timed Challenges")
    .map((c) => c.id);
  const aiIds = Array.from(SERVER_CHALLENGE_REGISTRY.values())
    .filter((c) => c.category === "AI & Future Skills")
    .map((c) => c.id);

  return [
    techIds[seed % techIds.length],
    hrIds[(seed >> 3) % hrIds.length],
    timedIds[(seed >> 5) % timedIds.length],
    aiIds[(seed >> 7) % aiIds.length],
  ];
}

function getPreviousDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

function getWeekStartDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0 (Sun) - 6 (Sat)
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

export const BADGE_DEFINITIONS = [
  {
    id: "first_step",
    name: "First Step",
    icon: "Sparkles",
    description: "Complete your first qualifying interview challenge.",
    requirementText: "Complete 1 challenge (score ≥ 5.5/10)",
    targetCount: 1,
  },
  {
    id: "quick_thinker",
    name: "Quick Thinker",
    icon: "Zap",
    description: "Complete a Timed Challenge successfully within the time limit.",
    requirementText: "Complete 1 Timed Challenge",
    targetCount: 1,
  },
  {
    id: "technical_star",
    name: "Technical Star",
    icon: "Code2",
    description: "Complete 10 Technical challenges with passing scores.",
    requirementText: "Complete 10 Technical challenges",
    targetCount: 10,
  },
  {
    id: "hr_champion",
    name: "HR Champion",
    icon: "Users",
    description: "Complete 10 HR challenges using structured communication.",
    requirementText: "Complete 10 HR challenges",
    targetCount: 10,
  },
  {
    id: "perfect_score",
    name: "Perfect Score",
    icon: "Award",
    description: "Achieve a top score of 8.5/10 or higher on any challenge.",
    requirementText: "Score ≥ 8.5/10 on a challenge",
    targetCount: 1,
  },
  {
    id: "seven_day_streak",
    name: "Seven-Day Streak",
    icon: "Flame",
    description: "Complete at least one challenge every day for 7 consecutive days.",
    requirementText: "Reach a 7-day active streak",
    targetCount: 7,
  },
  {
    id: "consistency_king",
    name: "Consistency King",
    icon: "Calendar",
    description: "Complete challenges across 3 or more distinct calendar days.",
    requirementText: "Practice on 3+ distinct days",
    targetCount: 3,
  },
  {
    id: "ai_explorer",
    name: "AI Explorer",
    icon: "Cpu",
    description: "Complete 2 challenges in the AI & Future Skills category.",
    requirementText: "Complete 2 AI & Future Skills challenges",
    targetCount: 2,
  },
  {
    id: "interview_master",
    name: "Interview Master",
    icon: "Trophy",
    description: "Complete 15 total challenges across all interview categories.",
    requirementText: "Complete 15 total challenges",
    targetCount: 15,
  },
];

export function computeBadgesAndWeeklyState(userRecord, localDateStr) {
  const completions = userRecord.completedChallenges || [];
  const uniqueChalCount = completions.length;
  const timedCount = completions.filter((c) => c.category === "Timed Challenges").length;
  const techCount = completions.filter((c) => c.category === "Technical").length;
  const hrCount = completions.filter((c) => c.category === "HR").length;
  const aiCount = completions.filter((c) => c.category === "AI & Future Skills").length;
  const topScoreCount = completions.filter((c) => c.score >= REWARDS_CONFIG.topScoreThreshold).length;
  const distinctDays = Object.keys(userRecord.activityCalendar || {}).length;
  const maxStreak = Math.max(userRecord.currentStreak || 0, userRecord.longestStreak || 0);

  const progressByBadge = {
    first_step: Math.min(1, uniqueChalCount),
    quick_thinker: Math.min(1, timedCount),
    technical_star: Math.min(10, techCount),
    hr_champion: Math.min(10, hrCount),
    perfect_score: Math.min(1, topScoreCount),
    seven_day_streak: Math.min(7, maxStreak),
    consistency_king: Math.min(3, distinctDays),
    ai_explorer: Math.min(2, aiCount),
    interview_master: Math.min(15, uniqueChalCount),
  };

  const newlyUnlocked = [];
  const nowIso = new Date().toISOString();

  for (const badge of BADGE_DEFINITIONS) {
    const currentProg = progressByBadge[badge.id] || 0;
    if (currentProg >= badge.targetCount && !userRecord.unlockedBadges[badge.id]) {
      userRecord.unlockedBadges[badge.id] = { unlockedAt: nowIso };
      newlyUnlocked.push(badge.name);
    }
  }

  const badges = BADGE_DEFINITIONS.map((b) => ({
    ...b,
    currentProgress: progressByBadge[b.id] || 0,
    unlocked: Boolean(userRecord.unlockedBadges[b.id]),
    unlockedAt: userRecord.unlockedBadges[b.id]?.unlockedAt || null,
  }));

  // Weekly Special Challenges (scoped to current Monday-Sunday ISO week)
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(localDateStr || ""))
    ? String(localDateStr)
    : new Date().toISOString().slice(0, 10);
  const weekStart = getWeekStartDateStr(safeDate);

  const weeklyCompletions = completions.filter((c) => c.localDate >= weekStart);
  const weeklyTech = weeklyCompletions.filter((c) => c.category === "Technical").length;
  const weeklyHr = weeklyCompletions.filter((c) => c.category === "HR").length;
  const weeklySim = weeklyCompletions.filter((c) => c.challengeId === "timed_3m_01").length;
  const weeklyAi = weeklyCompletions.filter((c) => c.category === "AI & Future Skills").length;
  const weeklyPb = userRecord.improvedPersonalBestCount || 0;

  const weeklyChallenges = [
    {
      id: `wk_${weekStart}_tech5`,
      title: "Technical Sprint: Solve 5 Technical Questions",
      description: "Complete 5 Technical category challenges with passing evaluation scores this week.",
      current: Math.min(5, weeklyTech),
      target: 5,
      rewardXp: REWARDS_CONFIG.weeklyChallengeBonusXp,
      completed: weeklyTech >= 5,
    },
    {
      id: `wk_${weekStart}_hr3`,
      title: "Behavioral Communicator: Complete 3 HR Challenges",
      description: "Complete 3 HR challenges demonstrating structured communication.",
      current: Math.min(3, weeklyHr),
      target: 3,
      rewardXp: REWARDS_CONFIG.weeklyChallengeBonusXp,
      completed: weeklyHr >= 3,
    },
    {
      id: `wk_${weekStart}_sim1`,
      title: "Full Loop Simulation: 3-Minute Interview Challenge",
      description: "Complete the 3-Minute Timed Interview Challenge under the clock.",
      current: Math.min(1, weeklySim),
      target: 1,
      rewardXp: REWARDS_CONFIG.weeklyChallengeBonusXp,
      completed: weeklySim >= 1,
    },
    {
      id: `wk_${weekStart}_ai1`,
      title: "AI Pioneer: Complete an AI Fundamentals Challenge",
      description: "Complete at least 1 challenge in the AI & Future Skills track.",
      current: Math.min(1, weeklyAi),
      target: 1,
      rewardXp: REWARDS_CONFIG.weeklyChallengeBonusXp,
      completed: weeklyAi >= 1,
    },
    {
      id: `wk_${weekStart}_pb1`,
      title: "Raise the Bar: Improve Your Personal Best Score",
      description: "Beat your previous highest challenge evaluation score on a subsequent attempt.",
      current: Math.min(1, weeklyPb),
      target: 1,
      rewardXp: REWARDS_CONFIG.weeklyChallengeBonusXp,
      completed: weeklyPb >= 1,
    },
  ];

  // Award weekly challenge bonus XP once per weekly goal ID
  for (const wk of weeklyChallenges) {
    if (wk.completed && !userRecord.rewardedAttemptIds.includes(wk.id)) {
      userRecord.rewardedAttemptIds.push(wk.id);
      const txId = `tx_wk_${crypto.randomBytes(6).toString("hex")}`;
      userRecord.totalXp += wk.rewardXp;
      userRecord.xpHistory.unshift({
        txId,
        reason: `Weekly Goal Completed: ${wk.title}`,
        xp: wk.rewardXp,
        timestamp: nowIso,
      });
    }
  }

  return { badges, weeklyChallenges, newlyUnlocked };
}

export function buildLeaderboard(store, localDateStr) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(localDateStr || ""))
    ? String(localDateStr)
    : new Date().toISOString().slice(0, 10);
  const weekStart = getWeekStartDateStr(safeDate);

  const entries = Object.values(store.users)
    .filter((u) => u.leaderboardOptIn !== false && (u.totalXp > 0 || (u.completedChallenges?.length || 0) > 0))
    .map((u) => {
      const weeklyXp = (u.completedChallenges || [])
        .filter((c) => c.localDate >= weekStart)
        .reduce((sum, c) => sum + (c.xpAwarded || 0), 0);
      const lvl = calculateLevelProgress(u.totalXp);
      return {
        userId: u.userId,
        displayName: u.displayName || "Candidate",
        initials: (u.displayName || "C")
          .split(/\s+/)
          .map((p) => p[0])
          .join("")
          .toUpperCase()
          .slice(0, 2),
        totalXp: u.totalXp,
        weeklyXp: weeklyXp || u.totalXp,
        challengesCompleted: (u.completedChallenges || []).length,
        currentLevel: lvl.currentLevel,
        levelTitle: lvl.levelTitle,
      };
    })
    .sort((a, b) => b.weeklyXp - a.weeklyXp || b.totalXp - a.totalXp);

  return entries.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));
}

export function getUserGamificationState({ userId, displayName, localDate }) {
  const store = readStore();
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(localDate || ""))
    ? String(localDate)
    : new Date().toISOString().slice(0, 10);

  const userRecord = getOrCreateUserRecord(store, userId, displayName);
  const { badges, weeklyChallenges } = computeBadgesAndWeeklyState(userRecord, safeDate);
  writeStore(store);

  const levelInfo = calculateLevelProgress(userRecord.totalXp);
  const dailyChallengeIds = getDeterministicDailyChallengeIds(safeDate);
  const completedTodayIds = (userRecord.completedChallenges || [])
    .filter((c) => c.localDate === safeDate)
    .map((c) => c.challengeId);

  const leaderboard = buildLeaderboard(store, safeDate);

  return {
    userId: userRecord.userId,
    displayName: userRecord.displayName,
    leaderboardOptIn: userRecord.leaderboardOptIn !== false,
    totalXp: userRecord.totalXp,
    ...levelInfo,
    currentStreak: userRecord.currentStreak,
    longestStreak: userRecord.longestStreak,
    lastCompletedDate: userRecord.lastCompletedDate,
    activityCalendar: userRecord.activityCalendar,
    completedChallenges: (userRecord.completedChallenges || []).slice(0, 30),
    xpHistory: (userRecord.xpHistory || []).slice(0, 25),
    badges,
    weeklyChallenges,
    dailyChallengeIds,
    completedTodayIds,
    leaderboard,
    rewardsConfig: REWARDS_CONFIG,
  };
}

/**
 * Deterministic rule-based evaluation fallback when Gemini is offline or rate-limited,
 * ensuring the backend always validates answer quality before awarding XP.
 */
function evaluateChallengeOnServerFallback({ answer, expectedKeywords }) {
  const trimmed = String(answer || "").trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const lower = trimmed.toLowerCase();

  const matched = (expectedKeywords || []).filter((kw) =>
    lower.includes(String(kw).toLowerCase())
  );
  const missing = (expectedKeywords || []).filter(
    (kw) => !lower.includes(String(kw).toLowerCase())
  );

  const coverageRatio =
    expectedKeywords && expectedKeywords.length > 0
      ? matched.length / expectedKeywords.length
      : 0.6;

  const lengthScore = Math.min(10, Math.max(3, Math.round(words.length / 6)));
  const accuracyScore = Math.min(10, Math.max(4, Math.round(4 + coverageRatio * 6)));
  const clarityScore = words.length >= 18 ? 8 : words.length >= 10 ? 6.5 : 4.5;
  const overall = Number(((lengthScore * 0.3 + accuracyScore * 0.45 + clarityScore * 0.25)).toFixed(1));

  return {
    score: overall,
    relevance: {
      score: Math.round(lengthScore),
      feedback:
        words.length >= 20
          ? "Your response directly addresses the challenge prompt with concrete detail."
          : "Expand your explanation with a specific example to strengthen relevance.",
    },
    technicalAccuracy: {
      score: accuracyScore,
      feedback:
        matched.length > 0
          ? `Covered key concepts: ${matched.join(", ")}.`
          : "Include more domain-specific terminology and technical mechanisms.",
    },
    communicationClarity: {
      score: Math.round(clarityScore),
      feedback: "Structured and readable response.",
    },
    missingImportantPoints: missing.slice(0, 4),
    suggestionsForImprovement:
      missing.length > 0
        ? [`Incorporate discussion of: ${missing.slice(0, 3).join(", ")}.`]
        : ["Quantify performance trade-offs or real-world edge cases."],
    improvedAnswer: `A strong response should cover ${(expectedKeywords || []).join(", ")} with clear structure and practical trade-offs.`,
    isOfflineEvaluation: true,
  };
}

export async function submitAndVerifyChallengeAttempt({
  userId,
  displayName,
  attemptId,
  challengeId,
  questionPrompt,
  answer,
  elapsedSeconds = 0,
  localDate,
  preferOfflineEvaluation = false,
}) {
  if (!userId || typeof userId !== "string") {
    throw new Error("Valid userId is required for server-verified challenge completion.");
  }
  if (!attemptId || typeof attemptId !== "string" || attemptId.length > 120) {
    throw new Error("Valid unique attemptId is required.");
  }

  const challengeMeta = SERVER_CHALLENGE_REGISTRY.get(challengeId);
  if (!challengeMeta) {
    throw new Error("Invalid or unrecognized challengeId.");
  }

  const trimmedAnswer = String(answer || "").trim();
  const wordCount = trimmedAnswer.split(/\s+/).filter(Boolean).length;
  if (!trimmedAnswer || wordCount < 5) {
    throw new Error(
      "Challenge submission is too short or empty. Provide a complete answer (at least 5 words) to qualify for evaluation and XP."
    );
  }

  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(localDate || ""))
    ? String(localDate)
    : new Date().toISOString().slice(0, 10);

  const store = readStore();
  const userRecord = getOrCreateUserRecord(store, userId, displayName);

  // Prevent duplicate reward for the same attemptId
  if (userRecord.rewardedAttemptIds.includes(attemptId)) {
    const state = getUserGamificationState({ userId, displayName, localDate: safeDate });
    return {
      alreadyRewarded: true,
      qualified: false,
      xpAwarded: 0,
      txId: null,
      message: "This challenge attempt has already been evaluated and rewarded.",
      evaluation: null,
      state,
    };
  }

  // Evaluate the answer using Gemini (or deterministic server rubric if offline mode requested)
  let evaluation;
  if (preferOfflineEvaluation) {
    evaluation = evaluateChallengeOnServerFallback({
      answer: trimmedAnswer,
      expectedKeywords: challengeMeta.expectedKeywords,
    });
  } else {
    try {
      evaluation = await evaluateInterviewAnswer({
        role: `Candidate (${challengeMeta.category} - ${challengeMeta.subcategory})`,
        experience: "Intermediate",
        difficulty: challengeMeta.difficulty,
        question: questionPrompt || challengeMeta.title,
        answer: trimmedAnswer,
      });
    } catch {
      evaluation = evaluateChallengeOnServerFallback({
        answer: trimmedAnswer,
        expectedKeywords: challengeMeta.expectedKeywords,
      });
    }
  }

  const withinTimeLimit =
    !challengeMeta.timeLimitSeconds ||
    Number(elapsedSeconds) <= challengeMeta.timeLimitSeconds + 5;

  const qualified =
    evaluation.score >= REWARDS_CONFIG.passingScoreThreshold && withinTimeLimit;

  let xpAwarded = 0;
  let txId = null;
  const previousLevel = calculateLevelProgress(userRecord.totalXp).currentLevel;

  if (qualified) {
    userRecord.rewardedAttemptIds.push(attemptId);

    const baseXp =
      REWARDS_CONFIG.xpByDifficulty[challengeMeta.difficulty] ||
      REWARDS_CONFIG.xpByDifficulty.Medium;

    const dailyIds = getDeterministicDailyChallengeIds(safeDate);
    const isDailyChallenge = dailyIds.includes(challengeId);
    const alreadyCompletedDailyToday = (userRecord.completedChallenges || []).some(
      (c) => c.localDate === safeDate && c.challengeId === challengeId && c.isDaily
    );

    const dailyBonus =
      isDailyChallenge && !alreadyCompletedDailyToday
        ? REWARDS_CONFIG.dailyChallengeBonusXp
        : 0;

    xpAwarded = baseXp + dailyBonus;
    txId = `tx_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    // Check if personal best improved (after at least 1 prior completion)
    if (
      userRecord.completedChallenges.length >= 1 &&
      evaluation.score > (userRecord.bestScore || 0)
    ) {
      userRecord.improvedPersonalBestCount =
        (userRecord.improvedPersonalBestCount || 0) + 1;
    }
    if (evaluation.score > (userRecord.bestScore || 0)) {
      userRecord.bestScore = evaluation.score;
    }

    // Update Streak (only once per local calendar date)
    const prevDate = getPreviousDateStr(safeDate);
    if (userRecord.lastCompletedDate !== safeDate) {
      if (userRecord.lastCompletedDate === prevDate) {
        userRecord.currentStreak = (userRecord.currentStreak || 0) + 1;
      } else {
        userRecord.currentStreak = 1;
      }
      userRecord.lastCompletedDate = safeDate;
      if (userRecord.currentStreak > (userRecord.longestStreak || 0)) {
        userRecord.longestStreak = userRecord.currentStreak;
      }
    }

    // Update Activity Calendar
    if (!userRecord.activityCalendar[safeDate]) {
      userRecord.activityCalendar[safeDate] = { count: 0, xpEarned: 0 };
    }
    userRecord.activityCalendar[safeDate].count += 1;
    userRecord.activityCalendar[safeDate].xpEarned += xpAwarded;

    // Record XP & Completion
    userRecord.totalXp += xpAwarded;
    const nowIso = new Date().toISOString();

    userRecord.xpHistory.unshift({
      txId,
      reason: `${challengeMeta.title} (${challengeMeta.difficulty}${
        dailyBonus > 0 ? " + Daily Bonus" : ""
      })`,
      xp: xpAwarded,
      timestamp: nowIso,
    });

    userRecord.completedChallenges.unshift({
      attemptId,
      txId,
      challengeId,
      title: challengeMeta.title,
      category: challengeMeta.category,
      subcategory: challengeMeta.subcategory,
      difficulty: challengeMeta.difficulty,
      score: Number(evaluation.score.toFixed(1)),
      xpAwarded,
      isDaily: isDailyChallenge,
      completedAt: nowIso,
      localDate: safeDate,
    });
  }

  const { newlyUnlocked } = computeBadgesAndWeeklyState(userRecord, safeDate);
  writeStore(store);

  const newLevel = calculateLevelProgress(userRecord.totalXp).currentLevel;
  const leveledUp = newLevel > previousLevel;

  const updatedState = getUserGamificationState({
    userId,
    displayName,
    localDate: safeDate,
  });

  return {
    alreadyRewarded: false,
    qualified,
    withinTimeLimit,
    xpAwarded,
    txId,
    leveledUp,
    newlyUnlockedBadges: newlyUnlocked,
    evaluation,
    state: updatedState,
  };
}

export function updateLeaderboardPreference({ userId, displayName, optIn, localDate }) {
  const store = readStore();
  const userRecord = getOrCreateUserRecord(store, userId, displayName);
  userRecord.leaderboardOptIn = Boolean(optIn);
  writeStore(store);
  return getUserGamificationState({ userId, displayName, localDate });
}

// ============================================================================
// SKILL ARCADE — SERVER-VERIFIED GAME ENGINE, UNLOCK SYSTEM & ANALYTICS
// ============================================================================

export const ARCADE_GAMES_REGISTRY = new Map([
  [
    "code_hunter",
    {
      id: "code_hunter",
      title: "Code Hunter",
      category: "Programming",
      primarySkill: "Debugging & Code Analysis",
    },
  ],
  [
    "brain_battle",
    {
      id: "brain_battle",
      title: "Brain Battle",
      category: "Computer Science",
      primarySkill: "CS & AI Fundamentals",
    },
  ],
  [
    "memory_match",
    {
      id: "memory_match",
      title: "Memory Match",
      category: "Problem Solving",
      primarySkill: "Technical Concept Recall",
    },
  ],
  [
    "logic_detective",
    {
      id: "logic_detective",
      title: "Logic Detective",
      category: "Logical Reasoning",
      primarySkill: "Analytical & Pattern Reasoning",
    },
  ],
  [
    "interview_simulator",
    {
      id: "interview_simulator",
      title: "Interview Simulator",
      category: "Interview Skills",
      primarySkill: "Workplace & Executive Communication",
    },
  ],
]);

export const ARCADE_LEVEL_CONFIG = {
  Beginner: {
    order: 1,
    baseXp: 15,
    minPassAccuracy: 60,
    unlockRequirementAccuracy: 0,
    prerequisiteLevel: null,
    unlockRuleText: "Unlocked by default for all students.",
  },
  Intermediate: {
    order: 2,
    baseXp: 25,
    minPassAccuracy: 60,
    unlockRequirementAccuracy: 60,
    prerequisiteLevel: "Beginner",
    unlockRuleText: "Complete Beginner level in this game with at least 60% accuracy to unlock Intermediate.",
  },
  Advanced: {
    order: 3,
    baseXp: 40,
    minPassAccuracy: 65,
    unlockRequirementAccuracy: 70,
    prerequisiteLevel: "Intermediate",
    unlockRuleText: "Complete Intermediate level in this game with at least 70% accuracy to unlock Advanced.",
  },
  Expert: {
    order: 4,
    baseXp: 60,
    minPassAccuracy: 70,
    unlockRequirementAccuracy: 75,
    prerequisiteLevel: "Advanced",
    unlockRuleText: "Complete Advanced level in this game with at least 75% accuracy to unlock Expert.",
  },
};

export const ARCADE_BADGE_DEFINITIONS = [
  {
    id: "arcade_bug_squasher",
    name: "Bug Squasher",
    icon: "Code2",
    description: "Complete a Code Hunter debugging session with at least 75% accuracy.",
    requirementText: "Code Hunter accuracy ≥ 75%",
    gameId: "code_hunter",
  },
  {
    id: "arcade_quiz_blitz",
    name: "Quiz Blitz",
    icon: "Zap",
    description: "Complete a Brain Battle rapid quiz with at least 75% accuracy.",
    requirementText: "Brain Battle accuracy ≥ 75%",
    gameId: "brain_battle",
  },
  {
    id: "arcade_memory_maestro",
    name: "Memory Maestro",
    icon: "Layers",
    description: "Clear a Memory Match board with at least 75% pair-matching efficiency.",
    requirementText: "Memory Match accuracy ≥ 75%",
    gameId: "memory_match",
  },
  {
    id: "arcade_master_detective",
    name: "Master Detective",
    icon: "Search",
    description: "Solve Logic Detective puzzles with at least 75% accuracy.",
    requirementText: "Logic Detective accuracy ≥ 75%",
    gameId: "logic_detective",
  },
  {
    id: "arcade_exec_communicator",
    name: "Executive Communicator",
    icon: "Users",
    description: "Complete an Interview Simulator workplace scenario with at least 75% score.",
    requirementText: "Interview Simulator accuracy ≥ 75%",
    gameId: "interview_simulator",
  },
  {
    id: "arcade_legend",
    name: "Arcade Legend",
    icon: "Trophy",
    description: "Complete at least 1 passing session across all 5 Skill Arcade games.",
    requirementText: "Complete all 5 Skill Arcade games",
    gameId: "all",
  },
];

function ensureArcadeFields(userRecord) {
  if (!Array.isArray(userRecord.arcadeAttempts)) {
    userRecord.arcadeAttempts = [];
  }
  if (!userRecord.arcadeUnlockedLevels || typeof userRecord.arcadeUnlockedLevels !== "object") {
    userRecord.arcadeUnlockedLevels = {
      code_hunter: ["Beginner"],
      brain_battle: ["Beginner"],
      memory_match: ["Beginner"],
      logic_detective: ["Beginner"],
      interview_simulator: ["Beginner"],
    };
  }
  for (const gameId of ARCADE_GAMES_REGISTRY.keys()) {
    if (!Array.isArray(userRecord.arcadeUnlockedLevels[gameId])) {
      userRecord.arcadeUnlockedLevels[gameId] = ["Beginner"];
    }
  }
  if (!userRecord.arcadePersonalBests || typeof userRecord.arcadePersonalBests !== "object") {
    userRecord.arcadePersonalBests = {};
  }
  if (!userRecord.arcadeBadges || typeof userRecord.arcadeBadges !== "object") {
    userRecord.arcadeBadges = {};
  }
}

export function getDeterministicDailyArcadeChallenge(localDateStr) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(localDateStr || ""))
    ? String(localDateStr)
    : new Date().toISOString().slice(0, 10);

  let hash = 2166136261;
  for (let i = 0; i < safeDate.length; i++) {
    hash ^= safeDate.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const seed = Math.abs(hash);
  const games = Array.from(ARCADE_GAMES_REGISTRY.values());
  const selectedGame = games[seed % games.length];

  return {
    id: `daily_arcade_${safeDate}_${selectedGame.id}`,
    date: safeDate,
    gameId: selectedGame.id,
    gameTitle: selectedGame.title,
    category: selectedGame.category,
    recommendedLevel: "Beginner",
    bonusXp: 15,
    description: `Complete a passing session of ${selectedGame.title} today (accuracy ≥ 60%) to earn +15 Daily Arcade Bonus XP.`,
  };
}

function computeArcadeAnalyticsAndBadges(userRecord, safeDate) {
  ensureArcadeFields(userRecord);
  const attempts = userRecord.arcadeAttempts || [];
  const completedAttempts = attempts.filter((a) => a.qualified);

  const gamesPlayed = attempts.length;
  const gamesCompleted = completedAttempts.length;
  const overallAccuracy =
    gamesPlayed > 0
      ? Math.round(attempts.reduce((sum, a) => sum + (Number(a.accuracy) || 0), 0) / gamesPlayed)
      : 0;
  const averageCompletionTimeSeconds =
    gamesPlayed > 0
      ? Math.round(
          attempts.reduce((sum, a) => sum + (Number(a.completionTimeSeconds) || 0), 0) /
            gamesPlayed
        )
      : 0;

  // Compute skill breakdown from real attempts
  const skillMap = new Map();
  for (const att of attempts) {
    const skillName = att.skillTag || att.category || "Problem Solving";
    if (!skillMap.has(skillName)) {
      skillMap.set(skillName, { totalAcc: 0, count: 0, missedTopics: new Set() });
    }
    const entry = skillMap.get(skillName);
    entry.totalAcc += Number(att.accuracy) || 0;
    entry.count += 1;
    if (Array.isArray(att.missedTopics)) {
      att.missedTopics.forEach((t) => entry.missedTopics.add(t));
    }
  }

  const skillStats = Array.from(skillMap.entries()).map(([skill, info]) => ({
    skill,
    averageAccuracy: Math.round(info.totalAcc / info.count),
    attemptsCount: info.count,
    missedTopics: Array.from(info.missedTopics).slice(0, 4),
  }));

  const sortedByAccuracyDesc = [...skillStats].sort(
    (a, b) => b.averageAccuracy - a.averageAccuracy
  );
  const strongestSkills = sortedByAccuracyDesc.filter((s) => s.averageAccuracy >= 65).slice(0, 3);
  const weakestSkills = [...skillStats]
    .sort((a, b) => a.averageAccuracy - b.averageAccuracy)
    .filter((s) => s.averageAccuracy < 80)
    .slice(0, 3);

  // Improvement trend (chronological order of last 10 attempts)
  const chronological = [...attempts].slice(0, 10).reverse();
  const improvementTrend = chronological.map((att, idx) => ({
    attemptIndex: idx + 1,
    gameId: att.gameId,
    gameTitle: att.gameTitle,
    level: att.level,
    accuracy: att.accuracy,
    score: att.score,
    completionTimeSeconds: att.completionTimeSeconds,
    completedAt: att.completedAt,
  }));

  // Evaluate Arcade Badges
  const newlyUnlockedArcadeBadges = [];
  const nowIso = new Date().toISOString();
  const distinctGamesCompleted = new Set(completedAttempts.map((a) => a.gameId));

  for (const b of ARCADE_BADGE_DEFINITIONS) {
    const met =
      b.gameId === "all"
        ? distinctGamesCompleted.size >= 5
        : completedAttempts.some((a) => a.gameId === b.gameId && a.accuracy >= 75);
    if (met && !userRecord.arcadeBadges[b.id]) {
      userRecord.arcadeBadges[b.id] = { unlockedAt: nowIso };
      newlyUnlockedArcadeBadges.push(b.name);
    }
  }

  const arcadeBadges = ARCADE_BADGE_DEFINITIONS.map((b) => {
    const unlocked = Boolean(userRecord.arcadeBadges[b.id]);
    const currentProgress =
      b.gameId === "all"
        ? distinctGamesCompleted.size
        : completedAttempts.some((a) => a.gameId === b.gameId && a.accuracy >= 75)
          ? 1
          : 0;
    const targetCount = b.gameId === "all" ? 5 : 1;
    return {
      ...b,
      unlocked,
      unlockedAt: userRecord.arcadeBadges[b.id]?.unlockedAt || null,
      currentProgress,
      targetCount,
    };
  });

  const dailyArcade = getDeterministicDailyArcadeChallenge(safeDate);
  const dailyArcadeCompleted = completedAttempts.some(
    (a) => a.localDate === safeDate && a.gameId === dailyArcade.gameId
  );

  return {
    analytics: {
      gamesPlayed,
      gamesCompleted,
      overallAccuracy,
      averageCompletionTimeSeconds,
      strongestSkills,
      weakestSkills,
      improvementTrend,
    },
    arcadeBadges,
    newlyUnlockedArcadeBadges,
    dailyArcade: {
      ...dailyArcade,
      completed: dailyArcadeCompleted,
    },
  };
}

export function getSkillArcadeState({ userId, displayName, localDate }) {
  const store = readStore();
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(localDate || ""))
    ? String(localDate)
    : new Date().toISOString().slice(0, 10);

  const userRecord = getOrCreateUserRecord(store, userId, displayName);
  ensureArcadeFields(userRecord);

  const { analytics, arcadeBadges, dailyArcade } = computeArcadeAnalyticsAndBadges(
    userRecord,
    safeDate
  );
  writeStore(store);

  const gamificationState = getUserGamificationState({
    userId,
    displayName,
    localDate: safeDate,
  });

  return {
    userId: userRecord.userId,
    displayName: userRecord.displayName,
    totalXp: gamificationState.totalXp,
    currentLevel: gamificationState.currentLevel,
    levelTitle: gamificationState.levelTitle,
    progressPercent: gamificationState.progressPercent,
    xpNeededForNextLevel: gamificationState.xpNeededForNextLevel,
    currentStreak: gamificationState.currentStreak,
    longestStreak: gamificationState.longestStreak,
    unlockedLevels: userRecord.arcadeUnlockedLevels,
    personalBests: userRecord.arcadePersonalBests,
    recentAttempts: (userRecord.arcadeAttempts || []).slice(0, 20),
    arcadeBadges,
    dailyArcade,
    analytics,
  };
}

export function submitAndVerifyArcadeAttempt({
  userId,
  displayName,
  attemptId,
  gameId,
  level = "Beginner",
  score = 0,
  accuracy = 0,
  correctCount = 0,
  totalQuestions = 1,
  completionTimeSeconds = 0,
  skillTag = "",
  missedTopics = [],
  localDate,
}) {
  if (!userId || typeof userId !== "string") {
    throw new Error("Valid userId is required for server-verified Skill Arcade rewards.");
  }
  if (!attemptId || typeof attemptId !== "string" || attemptId.length > 120) {
    throw new Error("Valid unique attemptId is required.");
  }

  const gameMeta = ARCADE_GAMES_REGISTRY.get(gameId);
  if (!gameMeta) {
    throw new Error("Invalid or unrecognized Skill Arcade gameId.");
  }

  const levelMeta = ARCADE_LEVEL_CONFIG[level];
  if (!levelMeta) {
    throw new Error("Invalid game difficulty level.");
  }

  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(localDate || ""))
    ? String(localDate)
    : new Date().toISOString().slice(0, 10);

  const store = readStore();
  const userRecord = getOrCreateUserRecord(store, userId, displayName);
  ensureArcadeFields(userRecord);

  // Prevent duplicate XP for the same attemptId
  if (userRecord.rewardedAttemptIds.includes(attemptId)) {
    const state = getSkillArcadeState({ userId, displayName, localDate: safeDate });
    return {
      alreadyRewarded: true,
      qualified: false,
      xpAwarded: 0,
      txId: null,
      unlockedNextLevel: null,
      newlyUnlockedArcadeBadges: [],
      isNewPersonalBest: false,
      state,
    };
  }

  const safeAccuracy = Math.min(100, Math.max(0, Math.round(Number(accuracy) || 0)));
  const safeScore = Math.max(0, Math.round(Number(score) || 0));
  const safeTime = Math.max(1, Math.round(Number(completionTimeSeconds) || 1));

  // Verify that the student had unlocked this level
  const unlockedForGame = userRecord.arcadeUnlockedLevels[gameId] || ["Beginner"];
  if (!unlockedForGame.includes(level)) {
    throw new Error(`Level ${level} is currently locked for ${gameMeta.title}. ${levelMeta.unlockRuleText}`);
  }

  const qualified = safeAccuracy >= levelMeta.minPassAccuracy && Number(totalQuestions) > 0;
  let xpAwarded = 0;
  let txId = null;
  let unlockedNextLevel = null;
  let isNewPersonalBest = false;
  const previousUserLevel = calculateLevelProgress(userRecord.totalXp).currentLevel;

  // Record the attempt ID so it can never be submitted twice
  userRecord.rewardedAttemptIds.push(attemptId);

  if (qualified) {
    let baseXp = levelMeta.baseXp;

    // First-time level completion bonus (+10 XP once per gameId + level)
    const levelCompletionKey = `arcade_lvl_first_${gameId}_${level}`;
    let levelBonusXp = 0;
    if (!userRecord.rewardedAttemptIds.includes(levelCompletionKey)) {
      userRecord.rewardedAttemptIds.push(levelCompletionKey);
      levelBonusXp = 10;
    }

    // Daily Arcade Challenge bonus (+15 XP once per calendar day)
    const dailyArcade = getDeterministicDailyArcadeChallenge(safeDate);
    const dailyKey = `arcade_daily_${safeDate}_${dailyArcade.gameId}`;
    let dailyBonusXp = 0;
    if (
      dailyArcade.gameId === gameId &&
      !userRecord.rewardedAttemptIds.includes(dailyKey)
    ) {
      userRecord.rewardedAttemptIds.push(dailyKey);
      dailyBonusXp = dailyArcade.bonusXp;
    }

    xpAwarded = baseXp + levelBonusXp + dailyBonusXp;
    txId = `tx_arc_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    // Check if next difficulty level unlocks based on actual accuracy
    const levelOrder = ["Beginner", "Intermediate", "Advanced", "Expert"];
    const currentIdx = levelOrder.indexOf(level);
    if (currentIdx >= 0 && currentIdx < levelOrder.length - 1) {
      const nextLvlName = levelOrder[currentIdx + 1];
      const nextLvlMeta = ARCADE_LEVEL_CONFIG[nextLvlName];
      if (
        safeAccuracy >= nextLvlMeta.unlockRequirementAccuracy &&
        !userRecord.arcadeUnlockedLevels[gameId].includes(nextLvlName)
      ) {
        userRecord.arcadeUnlockedLevels[gameId].push(nextLvlName);
        unlockedNextLevel = nextLvlName;
      }
    }

    // Update Personal Best for this game
    const prevBest = userRecord.arcadePersonalBests[gameId];
    if (
      !prevBest ||
      safeScore > prevBest.bestScore ||
      (safeScore === prevBest.bestScore && safeAccuracy > prevBest.bestAccuracy)
    ) {
      isNewPersonalBest = Boolean(prevBest);
      userRecord.arcadePersonalBests[gameId] = {
        bestScore: Math.max(safeScore, prevBest?.bestScore || 0),
        bestAccuracy: Math.max(safeAccuracy, prevBest?.bestAccuracy || 0),
        fastestTimeSeconds: prevBest?.fastestTimeSeconds
          ? Math.min(safeTime, prevBest.fastestTimeSeconds)
          : safeTime,
        highestLevelCleared: level,
        updatedAt: new Date().toISOString(),
      };
    }

    // Update unified streak & activity calendar
    const prevDate = getPreviousDateStr(safeDate);
    if (userRecord.lastCompletedDate !== safeDate) {
      if (userRecord.lastCompletedDate === prevDate) {
        userRecord.currentStreak = (userRecord.currentStreak || 0) + 1;
      } else {
        userRecord.currentStreak = 1;
      }
      userRecord.lastCompletedDate = safeDate;
      if (userRecord.currentStreak > (userRecord.longestStreak || 0)) {
        userRecord.longestStreak = userRecord.currentStreak;
      }
    }

    if (!userRecord.activityCalendar[safeDate]) {
      userRecord.activityCalendar[safeDate] = { count: 0, xpEarned: 0 };
    }
    userRecord.activityCalendar[safeDate].count += 1;
    userRecord.activityCalendar[safeDate].xpEarned += xpAwarded;

    // Credit unified XP & XP Transaction History
    userRecord.totalXp += xpAwarded;
    const nowIso = new Date().toISOString();
    userRecord.xpHistory.unshift({
      txId,
      reason: `Skill Arcade: ${gameMeta.title} (${level}${
        levelBonusXp > 0 ? " + Level Clear Bonus" : ""
      }${dailyBonusXp > 0 ? " + Daily Arcade Bonus" : ""})`,
      xp: xpAwarded,
      timestamp: nowIso,
    });
  }

  const nowIso = new Date().toISOString();
  userRecord.arcadeAttempts.unshift({
    attemptId,
    txId,
    gameId,
    gameTitle: gameMeta.title,
    category: gameMeta.category,
    skillTag: skillTag || gameMeta.primarySkill,
    level,
    score: safeScore,
    accuracy: safeAccuracy,
    correctCount: Number(correctCount) || 0,
    totalQuestions: Number(totalQuestions) || 1,
    completionTimeSeconds: safeTime,
    qualified,
    xpAwarded,
    missedTopics: Array.isArray(missedTopics) ? missedTopics.slice(0, 5).map(String) : [],
    completedAt: nowIso,
    localDate: safeDate,
  });

  const { newlyUnlockedArcadeBadges } = computeArcadeAnalyticsAndBadges(
    userRecord,
    safeDate
  );
  computeBadgesAndWeeklyState(userRecord, safeDate);
  writeStore(store);

  const newUserLevel = calculateLevelProgress(userRecord.totalXp).currentLevel;
  const leveledUp = newUserLevel > previousUserLevel;

  const updatedArcadeState = getSkillArcadeState({
    userId,
    displayName,
    localDate: safeDate,
  });

  return {
    alreadyRewarded: false,
    qualified,
    xpAwarded,
    txId,
    leveledUp,
    unlockedNextLevel,
    newlyUnlockedArcadeBadges,
    isNewPersonalBest,
    state: updatedArcadeState,
  };
}

