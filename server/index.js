
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  classifyGeminiError,
  evaluateInterviewAnswer,
  GeminiApiError,
  generateArcadeDynamicQuestion,
  generateArcadePersonalizedPlan,
  generateCompanyPrepQuestions,
  generateCompanyResearchBrief,
  generateInterviewQuestions,
  generateVocalIQCoaching,
  transcribeAudio
} from "./gemini.js";
import {
  getSkillArcadeState,
  getUserGamificationState,
  submitAndVerifyArcadeAttempt,
  submitAndVerifyChallengeAttempt,
  updateLeaderboardPreference,
} from "./gamificationStore.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5050;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, "../dist");

function logGeminiFailure(operation, error) {
  const configuredKey = process.env.GEMINI_API_KEY;
  const configuredModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const errorMessage = String(error?.message || "Unknown Gemini error");
  const safeMessage = configuredKey
    ? errorMessage.replaceAll(configuredKey, "[REDACTED]")
    : errorMessage;

  console.error(JSON.stringify({
    event: "gemini_request_failed",
    operation,
    model: configuredModel,
    httpStatus: error?.status ?? null,
    category: classifyGeminiError(error),
    errorType: error?.name ?? "Error",
    message: safeMessage,
    retryAfter: error?.retryAfter ?? null
  }));
}

function questionGenerationError(error) {
  const category = classifyGeminiError(error);
  if (category === "quota") {
    return {
      status: 429,
      message: "AI question generation has reached its usage limit. Please try again after the quota resets."
    };
  }
  if (category === "overloaded") {
    return {
      status: 503,
      message: "AI service is temporarily busy. Please try again shortly."
    };
  }
  if (category === "timeout") {
    return {
      status: 504,
      message: "The AI interviewer is taking longer than expected. Please try again."
    };
  }
  if (category === "network") {
    return {
      status: 503,
      message: "The server could not connect to Gemini. Please check the server's network connection and try again."
    };
  }
  if (category === "authentication") {
    return {
      status: 502,
      message: "Gemini rejected the server's API access. Please check its credentials and permissions."
    };
  }
  if (category === "server") {
    return {
      status: 502,
      message: "The Gemini service is temporarily unavailable. Please try again later."
    };
  }
  if (error instanceof GeminiApiError && /invalid JSON|malformed|invalid question list/i.test(error.message)) {
    return {
      status: 502,
      message: "Gemini returned an unreadable question response. Please try again."
    };
  }
  return {
    status: 502,
    message: "Unable to generate interview questions right now. Please try again."
  };
}

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const CACHE_TTL_MS = 15 * 60 * 1000;
const questionCache = new Map();
const evaluationCache = new Map();

function getCached(map, key) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(map, key, value) {
  if (map.size >= 100) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// API Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "INTERVEXA.AI Backend is running!",
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint: serve frontend if built, or status JSON
app.get("/", (req, res) => {
  if (fs.existsSync(distPath)) {
    return res.sendFile(path.join(distPath, "index.html"));
  }
  return res.json({
    success: true,
    message: "INTERVEXA.AI Backend is running!"
  });
});

// Generate AI interview questions
app.post("/api/interview/generate", async (req, res) => {
  try {
    const { role, experience, difficulty, count = 5, type } = req.body;

    if (
      typeof role !== "string" || !role.trim() ||
      typeof experience !== "string" || !experience.trim() ||
      typeof difficulty !== "string" || !difficulty.trim() ||
      !Number.isInteger(count) || count < 1 || count > 10
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid interview details."
      });
    }

    const normalizedType = typeof type === "string" && type.trim() ? type.trim() : "Mixed";
    const cacheKey = `${role.trim().toLowerCase()}|${experience.trim().toLowerCase()}|${difficulty.trim().toLowerCase()}|${count}|${normalizedType.toLowerCase()}`;
    const cachedResult = getCached(questionCache, cacheKey);
    if (cachedResult) {
      return res.json({
        success: true,
        data: cachedResult
      });
    }

    const result = await generateInterviewQuestions({
      role,
      experience,
      difficulty,
      count,
      type: normalizedType
    });

    setCached(questionCache, cacheKey, result);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logGeminiFailure("question_generation", error);
    const failure = questionGenerationError(error);
    res.status(failure.status).json({
      success: false,
      message: failure.message
    });
  }
});

app.post("/api/interview/evaluate", async (req, res) => {
  const { role, experience, difficulty, question, answer } = req.body ?? {};
  const validText = (value, maxLength) =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength;

  if (
    !validText(role, 200) ||
    !validText(experience, 100) ||
    !validText(difficulty, 50) ||
    !validText(question, 2000) ||
    !validText(answer, 10000)
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide a role, experience, difficulty, question, and non-empty answer within the allowed lengths."
    });
  }

  const evalCacheKey = `${role.trim().toLowerCase()}|${question.trim().toLowerCase()}|${answer.trim().toLowerCase()}`;
  const cachedEval = getCached(evaluationCache, evalCacheKey);
  if (cachedEval) {
    return res.json({
      success: true,
      data: { evaluation: cachedEval }
    });
  }

  try {
    const evaluation = await evaluateInterviewAnswer({
      role: role.trim(),
      experience: experience.trim(),
      difficulty: difficulty.trim(),
      question: question.trim(),
      answer: answer.trim()
    });

    setCached(evaluationCache, evalCacheKey, evaluation);

    return res.json({
      success: true,
      data: { evaluation }
    });
  } catch (error) {
    logGeminiFailure("answer_evaluation", error);
    return res.status(502).json({
      success: false,
      message: "Unable to evaluate this answer right now. Please try again."
    });
  }
});

app.post("/api/interview/transcribe", async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body ?? {};
    if (typeof audioBase64 !== "string" || !audioBase64.trim()) {
      return res.status(400).json({
        success: false,
        message: "No audio data provided."
      });
    }
    const transcript = await transcribeAudio({
      audioBase64: audioBase64.trim(),
      mimeType: typeof mimeType === "string" && mimeType.trim() ? mimeType.trim() : "audio/webm"
    });
    return res.json({
      success: true,
      data: { transcript }
    });
  } catch (error) {
    logGeminiFailure("audio_transcription", error);
    return res.status(502).json({
      success: false,
      message: "Unable to transcribe audio right now."
    });
  }
});

app.post("/api/interview/vocaliq-coach", async (req, res) => {
  try {
    const { role = "Software Engineer", experience = "Mid-Level", metrics = {}, answersSample = [] } = req.body ?? {};
    const coaching = await generateVocalIQCoaching({
      role: String(role).slice(0, 120),
      experience: String(experience).slice(0, 80),
      metrics,
      answersSample: Array.isArray(answersSample) ? answersSample.slice(0, 5) : [],
    });
    return res.json({
      success: true,
      data: coaching,
    });
  } catch (error) {
    logGeminiFailure("vocaliq_coaching", error);
    return res.status(502).json({
      success: false,
      message: "Unable to generate AI communication coaching right now."
    });
  }
});

app.post("/api/interview/company-prep/generate", async (req, res) => {
  try {
    const {
      company,
      role,
      experience,
      difficulty = "Intermediate",
      round = "Technical Round",
      skills = "",
      count = 4,
      bypassCache = false,
    } = req.body ?? {};

    if (
      typeof company !== "string" || !company.trim() || company.length > 120 ||
      typeof role !== "string" || !role.trim() || role.length > 120 ||
      typeof experience !== "string" || !experience.trim() || experience.length > 80 ||
      typeof difficulty !== "string" || !difficulty.trim() || difficulty.length > 50 ||
      typeof round !== "string" || !round.trim() || round.length > 80
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid company, role, experience, difficulty, and round details.",
      });
    }

    const safeCount = Math.min(6, Math.max(1, Number.isInteger(count) ? count : 4));
    const cacheKey = `comp|${company.trim().toLowerCase()}|${role.trim().toLowerCase()}|${experience.trim().toLowerCase()}|${difficulty.trim().toLowerCase()}|${round.trim().toLowerCase()}|${String(skills).trim().toLowerCase()}|${safeCount}`;

    if (!bypassCache) {
      const cached = getCached(questionCache, cacheKey);
      if (cached) {
        return res.json({
          success: true,
          data: cached,
        });
      }
    }

    const result = await generateCompanyPrepQuestions({
      company: company.trim(),
      role: role.trim(),
      experience: experience.trim(),
      difficulty: difficulty.trim(),
      round: round.trim(),
      skills: String(skills || "").trim().slice(0, 400),
      count: safeCount,
    });

    setCached(questionCache, cacheKey, result);
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logGeminiFailure("company_prep_generation", error);
    const failure = questionGenerationError(error);
    return res.status(failure.status).json({
      success: false,
      message: failure.message,
    });
  }
});

app.post("/api/interview/company-prep/research", async (req, res) => {
  try {
    const { company, role, experience = "1–3 years" } = req.body ?? {};
    if (
      typeof company !== "string" || !company.trim() || company.length > 120 ||
      typeof role !== "string" || !role.trim() || role.length > 120
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid company and role.",
      });
    }

    const cacheKey = `res|${company.trim().toLowerCase()}|${role.trim().toLowerCase()}|${String(experience).trim().toLowerCase()}`;
    const cached = getCached(questionCache, cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
      });
    }

    const brief = await generateCompanyResearchBrief({
      company: company.trim(),
      role: role.trim(),
      experience: String(experience || "1–3 years").trim().slice(0, 80),
    });

    setCached(questionCache, cacheKey, brief);
    return res.json({
      success: true,
      data: brief,
    });
  } catch (error) {
    logGeminiFailure("company_prep_research", error);
    const failure = questionGenerationError(error);
    return res.status(failure.status).json({
      success: false,
      message: failure.message,
    });
  }
});

// Gamified Interview Challenges (Server-Verified XP, Streaks, Badges & Leaderboard)
app.get("/api/challenges/state", (req, res) => {
  try {
    const userId = String(req.query.userId || "").trim();
    const displayName = String(req.query.displayName || "Candidate").trim();
    const localDate = String(req.query.localDate || "").trim();

    if (!userId || userId === "guest") {
      return res.status(400).json({
        success: false,
        message: "Authenticated userId is required for server-verified challenge state.",
      });
    }

    const state = getUserGamificationState({ userId, displayName, localDate });
    return res.json({
      success: true,
      data: state,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Unable to load gamification state.",
    });
  }
});

app.post("/api/challenges/submit", async (req, res) => {
  try {
    const {
      userId,
      displayName = "Candidate",
      attemptId,
      challengeId,
      questionPrompt,
      answer,
      elapsedSeconds = 0,
      localDate,
      preferOfflineEvaluation = false,
    } = req.body ?? {};

    if (!userId || typeof userId !== "string" || userId === "guest") {
      return res.status(400).json({
        success: false,
        message: "Sign in to submit for server-verified XP and leaderboard ranking.",
      });
    }

    const result = await submitAndVerifyChallengeAttempt({
      userId: userId.trim(),
      displayName: String(displayName || "Candidate").trim(),
      attemptId: String(attemptId || "").trim(),
      challengeId: String(challengeId || "").trim(),
      questionPrompt: String(questionPrompt || "").trim(),
      answer: String(answer || ""),
      elapsedSeconds: Number(elapsedSeconds) || 0,
      localDate: String(localDate || "").trim(),
      preferOfflineEvaluation: Boolean(preferOfflineEvaluation),
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Challenge submission validation failed.",
    });
  }
});

app.post("/api/challenges/leaderboard-opt-in", (req, res) => {
  try {
    const { userId, displayName = "Candidate", optIn = true, localDate } = req.body ?? {};
    if (!userId || typeof userId !== "string" || userId === "guest") {
      return res.status(400).json({
        success: false,
        message: "Valid authenticated userId is required.",
      });
    }
    const state = updateLeaderboardPreference({
      userId: userId.trim(),
      displayName: String(displayName || "Candidate").trim(),
      optIn: Boolean(optIn),
      localDate: String(localDate || "").trim(),
    });
    return res.json({
      success: true,
      data: state,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Unable to update leaderboard preference.",
    });
  }
});

// ============================================================================
// SKILL ARCADE ENDPOINTS (Server-Verified Game XP, Level Unlocks & AI Coach)
// ============================================================================

app.get("/api/arcade/state", (req, res) => {
  try {
    const userId = String(req.query.userId || "").trim();
    const displayName = String(req.query.displayName || "Candidate").trim();
    const localDate = String(req.query.localDate || "").trim();

    if (!userId || userId === "guest") {
      return res.status(400).json({
        success: false,
        message: "Authenticated userId is required for server-verified Skill Arcade state.",
      });
    }

    const state = getSkillArcadeState({ userId, displayName, localDate });
    return res.json({
      success: true,
      data: state,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Unable to load Skill Arcade state.",
    });
  }
});

app.post("/api/arcade/complete", (req, res) => {
  try {
    const {
      userId,
      displayName = "Candidate",
      attemptId,
      gameId,
      level = "Beginner",
      score = 0,
      accuracy = 0,
      correctCount = 0,
      totalQuestions = 1,
      completionTimeSeconds = 1,
      skillTag = "",
      missedTopics = [],
      localDate,
    } = req.body ?? {};

    if (!userId || typeof userId !== "string" || userId === "guest") {
      return res.status(400).json({
        success: false,
        message: "Sign in to record server-verified Skill Arcade XP and level progression.",
      });
    }

    const result = submitAndVerifyArcadeAttempt({
      userId: userId.trim(),
      displayName: String(displayName || "Candidate").trim(),
      attemptId: String(attemptId || "").trim(),
      gameId: String(gameId || "").trim(),
      level: String(level || "Beginner").trim(),
      score: Number(score) || 0,
      accuracy: Number(accuracy) || 0,
      correctCount: Number(correctCount) || 0,
      totalQuestions: Number(totalQuestions) || 1,
      completionTimeSeconds: Number(completionTimeSeconds) || 1,
      skillTag: String(skillTag || "").trim(),
      missedTopics: Array.isArray(missedTopics) ? missedTopics : [],
      localDate: String(localDate || "").trim(),
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Skill Arcade completion validation failed.",
    });
  }
});

app.post("/api/arcade/ai-coach", async (req, res) => {
  try {
    const { recentAttempts = [], weakestSkills = [], strongestSkills = [] } = req.body ?? {};
    const plan = await generateArcadePersonalizedPlan({
      recentAttempts: Array.isArray(recentAttempts) ? recentAttempts.slice(0, 6) : [],
      weakestSkills: Array.isArray(weakestSkills) ? weakestSkills.slice(0, 4) : [],
      strongestSkills: Array.isArray(strongestSkills) ? strongestSkills.slice(0, 4) : [],
    });
    return res.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    logGeminiFailure("arcade_ai_coach", error);
    return res.status(502).json({
      success: false,
      message: "Live AI coach is temporarily unavailable; using local analytics advisor.",
    });
  }
});

app.post("/api/arcade/ai-question", async (req, res) => {
  try {
    const { topic = "Data Structures & Algorithms", level = "Beginner" } = req.body ?? {};
    const question = await generateArcadeDynamicQuestion({
      topic: String(topic || "Data Structures & Algorithms").slice(0, 100),
      level: String(level || "Beginner").slice(0, 40),
    });
    return res.json({
      success: true,
      data: question,
    });
  } catch (error) {
    logGeminiFailure("arcade_ai_question", error);
    return res.status(502).json({
      success: false,
      message: "Live AI question generator is temporarily unavailable; using curated bank.",
    });
  }
});

// Serve frontend in production if dist/ exists
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }
    return res.sendFile(path.join(distPath, "index.html"));
  });
}

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status = Number.isInteger(error?.status) ? error.status : 500;
  const message =
    status === 400
      ? "Request body must contain valid JSON."
      : status === 413
        ? "Request body is too large."
        : "The request could not be processed.";

  return res.status(status).json({ success: false, message });
});

// Start server
app.listen(PORT, () => {
  console.log(`INTERVEXA.AI server running on port ${PORT}`);
});
