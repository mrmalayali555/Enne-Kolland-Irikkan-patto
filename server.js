/**
 * server.js — Minimal Express proxy for AI API calls.
 *
 * DUAL-AI STRATEGY: Fires NVIDIA Nemotron + Google Gemini simultaneously.
 * Whichever responds first with valid JSON wins. This gives us:
 * - Redundancy (if one API is down, the other covers)
 * - Speed (we always get the fastest response)
 * - Better object detection (Gemini is stronger at image recognition)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Health check ────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'alive',
    nvidia: !!process.env.NVIDIA_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
  });
});

// ─── Birth endpoint: detect object + generate passport DNA ───────
app.post('/api/birth', async (req, res) => {
  const { image, manualName } = req.body;

  if (!image && !manualName) {
    return res.status(400).json({ error: 'No image or object name provided' });
  }

  try {
    let dna;
    if (image) {
      dna = await raceBirth(image);
    } else {
      dna = await raceManualBirth(manualName);
    }
    res.json({ success: true, dna });
  } catch (err) {
    console.error('[BIRTH ERROR]', err.message);
    res.status(500).json({ error: 'AI birth failed', details: err.message });
  }
});

// ─── Life Script endpoint: generate entire life journey ───────────
app.post('/api/life-script', async (req, res) => {
  const { dna } = req.body;
  if (!dna) {
    return res.status(400).json({ error: 'No object DNA provided' });
  }

  try {
    const script = await raceLifeScript(dna);
    res.json({ success: true, script });
  } catch (err) {
    console.error('[LIFE SCRIPT ERROR]', err.message);
    // Return a safe fallback script
    res.json({ success: true, script: getFallbackLifeScript(dna) });
  }
});

// ─── Immigration endpoint: live AI reaction to player's typed answer ─
app.post('/api/immigration', async (req, res) => {
  const { dna, question, answer, final, lang } = req.body;
  if (!dna) return res.status(400).json({ error: 'Missing dna' });

  const IMMIGRATION_PROMPT = `You are an IMMIGRATION OFFICER for the Republic of Objects.\n
  
  Respond in a funny, sarcastic Manglish officer voice (short sentences), and return a JSON object EXACTLY with keys: { "reply": string, "decision": "approve"|"reject"|"ask_more" }.

  RULES:
  - Use Manglish (Malayalam words written in Latin) where possible; short, punchy, and comedic.
  - If the answer is plausible for the object's type (banana says "for sale", can says "holiday"), return "approve".
  - If it mentions hiding, smuggling, or dangerous behavior, return "ask_more" or "reject" based on severity.
  - For the "prove you are NOT a human" question, design a short follow-up test or witty counter (e.g., ask for a weird joke, sound imitation, or smell claim) and decide accordingly.
  - Keep the reply short (<= 120 chars). DO NOT output anything except valid JSON.

  EXAMPLE valid reply:
  { "reply": "Aiyo, okay — holiday aano? Passport nodu. Entry allowed.", "decision": "approve" }

  Do not include any extra text outside the JSON.`;

    // If no AI keys configured, give a fast local Manglish-flavored heuristic reply
    if (!process.env.GEMINI_API_KEY && !process.env.NVIDIA_API_KEY) {
      const quick = localImmigrationHeuristic(dna, question, answer, lang);
      return res.json({ success: true, reply: quick.reply, decision: quick.decision });
    }

    // Build the user prompt: support aggregated answers (final decision) or single Q/A
    let userPrompt;
    if (Array.isArray(req.body.answers)) {
      const lines = req.body.answers.map((a, idx) => `Q${idx + 1}: ${a.question}\nA${idx + 1}: ${a.answer || ''}\nReply: ${a.reply || ''}\nDecision: ${a.decision || ''}`);
      userPrompt = `IMMIGRATION AGGREGATE REVIEW:\n${lines.join('\n')}\nCONTEXT: ${dna.name} (${dna.objectType})\nLANG: ${lang || 'manglish'}`;
    } else {
      userPrompt = `QUESTION: ${question || ''}\nPLAYER_ANSWER: ${answer || ''}\nCONTEXT: ${dna.name} (${dna.objectType})\nLANG: ${lang || 'manglish'}`;
    }

    // Otherwise race AIs but with a safety timeout to keep responses snappy
    const aiPromise = raceAIs(api => api === 'gemini' ? callGeminiText(IMMIGRATION_PROMPT, userPrompt, 'Immigration') : callNvidiaText(IMMIGRATION_PROMPT, userPrompt, 'Immigration'));
    const timed = Promise.race([
      aiPromise,
      new Promise((resolve) => setTimeout(() => resolve({ _timedOut: true }), 6000))
    ]);

    const result = await timed;
    if (result && result._timedOut) {
      const quick = localImmigrationHeuristic(dna, question, answer, lang);
      return res.json({ success: true, reply: quick.reply, decision: quick.decision });
    }

    return res.json({ success: true, reply: result.reply || result, decision: result.decision || 'ask_more' });
  } catch (err) {
    console.error('[IMMIGRATION ERROR]', err.message);
    const quick = localImmigrationHeuristic(dna, question, answer, lang);
    return res.json({ success: true, reply: quick.reply, decision: quick.decision });
  }
});

function localImmigrationHeuristic(dna, question, answer, lang) {
  // Simple playful Manglish heuristics to keep interaction snappy when AI is slow/offline
  const obj = (dna.objectType || 'object').toLowerCase();
  const name = dna.name || 'Itthu';
  const ans = (answer || '').toLowerCase();

  // If answer contains 'tour' or 'visit' or 'holiday' approve
  if (/tour|visit|holiday|vacation|travel|tourism|vacay/.test(ans)) {
    return { reply: `Aiyo, ok ok. ${name}inu small holiday aanu. Welcome, welcome.`, decision: 'approve' };
  }

  // If user says 'hide' or 'bag' or 'smuggle' ask more
  if (/hide|bag|smuggl|hiding|fizz|buzz|sneak/.test(ans)) {
    return { reply: `Hmmmm... Bag-il vechittundo? Explain kuttikkoru detail kond.` , decision: 'ask_more' };
  }

  // If answer mentions 'sell' or 'for sale' likely normal
  if (/sell|for sale|market|shop|shoping|shop/.test(ans)) {
    return { reply: `Sale aano plan? Good luck. Entry allowed.`, decision: 'approve' };
  }

  // Otherwise random playful response leaning to ask_more
  // Manglish-flavored playful samples
  const samples = [
    { r: `${name} paranju: "Njan fruit aanu, pls" — officer: "Aiyo, ok then. Entry granted."`, d: 'approve' },
    { r: `Officer: "Ithu evidunnu vannu? Passport onnum illa? Kettadha."`, d: 'ask_more' },
    { r: `Officer suspicious: "Bag-il vechu chodikkunne? Explain, fast."`, d: 'ask_more' },
    { r: `Officer laughs: "Ithu enth? Njan pinne nokkam. Entry allowed."`, d: 'approve' },
    { r: `Officer: "Dangerous karyam paranjal, thirichariyuka."`, d: 'reject' }
  ];
  return samples[Math.floor(Math.random() * samples.length)];
}

// ─── Eval Action endpoint: evaluate free-action typed by the player ─
app.post('/api/eval-action', async (req, res) => {
  const { dna, state, actionText } = req.body;
  if (!dna || !actionText) return res.status(400).json({ error: 'Missing dna or actionText' });

  const ACTION_PROMPT = `You are a concise GAME JUDGE for "Enne Kolland Irikkan Patto?".

Task: Given the object's DNA and current state, EVALUATE the player's free-action request and RETURN ONLY valid JSON with the exact schema:
{
  "consequence": "short narration (1-2 sentences)",
  "stateChanges": { "money": number (optional), "mood": string (optional), "condition": string (optional), "location": string (optional), "wantedStatus": boolean (optional) },
  "memory": "short memory summary",
  "newRelationship": { "name": "string", "status": "string" } (optional)
}

Rules:
- Keep consequences short and plausible for the object.
- State changes must be small (money between -500 and +500) and realistic.
- Use Manglish or English; avoid long paragraphs.
- Do NOT include any surrounding explanation, markdown, or non-JSON text. RETURN JSON ONLY.`;

  try {
    const userPrompt = `OBJECT: ${dna.name} (${dna.objectType})\nSTATE: ${JSON.stringify(state)}\nACTION: ${actionText}`;
    try {
      const parsed = await raceAIs(api => api === 'gemini' ? callGeminiText(ACTION_PROMPT, userPrompt, 'EvalAction') : callNvidiaText(ACTION_PROMPT, userPrompt, 'EvalAction'));
      // Basic validation
      if (parsed && typeof parsed === 'object' && parsed.consequence) {
        return res.json({ success: true, result: parsed });
      }
      throw new Error('Invalid structure from AI');
    } catch (err) {
      console.error('[EVAL ACTION ERROR]', err.message);
      return res.json({ success: true, result: { consequence: 'Nothing much happened.', stateChanges: {}, memory: 'Attempted action; no notable effect.' } });
    }
  } catch (err) {
    console.error('[EVAL ACTION ERROR]', err.message);
    return res.json({ success: true, result: { consequence: 'Nothing much happened.', stateChanges: {}, memory: 'Attempted action; no notable effect.' } });
  }
});

// ─── Video generation stub: accept requests and simulate async job ─
const videoJobs = new Map();
let nextJobId = 1;

app.post('/api/generate-video', (req, res) => {
  const { scene, metadata } = req.body;
  const jobId = `job-${nextJobId++}`;
  // Create a stub job that completes in ~3s with a fake URL
  videoJobs.set(jobId, { status: 'pending', url: null });
  setTimeout(() => {
    videoJobs.set(jobId, { status: 'ready', url: `/videos/${jobId}.mp4` });
  }, 3000);
  res.json({ success: true, jobId });
});

app.get('/api/video-status/:jobId', (req, res) => {
  const job = videoJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  res.json({ success: true, status: job.status, url: job.url });
});

// ═══════════════════════════════════════════════════════════════════
// RACE STRATEGY: fire all available AIs, first valid response wins
// ═══════════════════════════════════════════════════════════════════

async function raceBirth(base64Image) {
  return raceAIs(
    (api) => api === 'gemini' ? callGeminiBirth(base64Image) : callNvidiaBirth(base64Image)
  );
}

async function raceManualBirth(objectName) {
  return raceAIs(
    (api) => api === 'gemini' ? callGeminiManualBirth(objectName) : callNvidiaManualBirth(objectName)
  );
}

async function raceLifeScript(dna) {
  return raceAIs(
    (api) => api === 'gemini' ? callGeminiLifeScript(dna) : callNvidiaLifeScript(dna)
  );
}

/** Generic race: fire all available AIs, first valid response wins */
async function raceAIs(callFn) {
  const promises = [];

  if (process.env.GEMINI_API_KEY) {
    promises.push(
      callFn('gemini').catch(err => {
        console.error('[GEMINI FAILED]', err.message);
        throw err;
      })
    );
  }

  if (process.env.NVIDIA_API_KEY) {
    promises.push(
      callFn('nvidia').catch(err => {
        console.error('[NVIDIA FAILED]', err.message);
        throw err;
      })
    );
  }

  if (promises.length === 0) throw new Error('No AI API keys configured');

  try {
    return await Promise.any(promises);
  } catch (aggErr) {
    const messages = aggErr.errors?.map(e => e.message).join('; ') || aggErr.message;
    throw new Error(`All AIs failed: ${messages}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════════

const COMEDY_SYSTEM_PROMPT = `You are the COMEDY WRITER for "Enne Kolland Irikkan Patto?" — a Malayalam absurdist game where ordinary physical objects get official government passports from the REPUBLIC OF OBJECTS.

YOUR JOB: Generate FUNNY passport data for any object. NOT normal AI descriptions.

LANGUAGE:
- Use natural Manglish (Malayalam words written in English letters, mixed with English)
- Keep it SHORT. This goes on a visual passport card.
- The humor comes from treating a RIDICULOUS object with EXTREME bureaucratic seriousness.

COMEDY RULES:
1. Every joke MUST relate to what the object actually IS and does
2. NEVER use generic words: "friendly", "helpful", "determined", "adventurous", "positive", "hardworking"
3. NEVER write motivational quotes or LinkedIn-style descriptions
4. Write like a Malayalam friend at 2 AM — natural, unexpected, absurd
5. Be UNPREDICTABLE — don't always use the same patterns
6. The player should think: "WHY DOES THIS OBJECT HAVE A GOVERNMENT PASSPORT? 😂"
7. Mix Malayalam and English naturally — don't force Manglish into every sentence

FIELD LENGTH LIMITS (STRICT):
- name: 1-4 words max
- objectType: 1-3 words
- origin: 3-8 words
- dateOfBirth: 3-6 words (funny date)
- personality: 5-12 words
- mood: 2-6 words
- strength: 5-12 words
- weakness: 5-12 words
- fear: 3-8 words
- inability: 5-12 words
- specialAbility: 5-12 words
- lifeGoal: 5-15 words
- backstory: 1-2 SHORT sentences max
- passportNumber: format OBJ-XXXXX (5 random digits)
- nationality: "Vasthy (OBJECT)" always

You MUST respond with ONLY valid JSON. No markdown. No code fences. No explanation.`;

const LIFE_SCRIPT_SYSTEM_PROMPT = `You are the GAME MASTER for "Enne Kolland Irikkan Patto?" — a Malayalam absurdist life simulator for everyday objects.

YOUR JOB: Generate the ENTIRE life journey for the object in a single structured JSON.

RULES:
1. The object's DNA (personality, fears, strengths, weaknesses) MUST influence the entire script.
2. Use natural Manglish (Malayalam + English mix) — short, funny, absurd.
3. Keep scenes, choices, and consequences SHORT (1-3 lines max).
4. The first chapter MUST be at the Airport/Immigration.
5. Create 4 chapters total, plus a death scene.
6. For each chapter, generate TWO meaningful choices. For EACH choice, provide the consequence, state changes, and a short memory.
7. State changes must logically follow the choice AND the object's nature (money, condition, mood, location).
8. The final chapter is DEATH. The death MUST be specific to what this object IS, and written in Manglish.

TONE: Like a Kerala friend narrating a soap opera about household objects at 2 AM.

IMPORTANT: You MUST respond with ONLY valid JSON matching the exact required schema. No markdown, no code fences, no reasoning text.`;

// ═══════════════════════════════════════════════════════════════════
// JSON SCHEMAS
// ═══════════════════════════════════════════════════════════════════

const PASSPORT_JSON_TEMPLATE = `{
  "name": "Funny Manglish name for this object (1-4 words)",
  "objectType": "What type (1-3 words)",
  "origin": "Funny birthplace in Manglish (3-8 words)",
  "dateOfBirth": "A funny date or era (3-6 words)",
  "nationality": "Vasthy (OBJECT)",
  "passportNumber": "OBJ-XXXXX",
  "personality": "Short funny Manglish personality (5-12 words)",
  "mood": "Current mood, funny (2-6 words)",
  "strength": "Object-specific funny strength (5-12 words)",
  "weakness": "Object-specific funny weakness (5-12 words)",
  "fear": "Object-specific funny fear (3-8 words)",
  "ambition": "Unnecessarily dramatic dream (5-12 words)",
  "backstory": "1-2 sentence funny Manglish origin story",
  "inability": "Funny thing this object cannot do (5-12 words)",
  "specialAbility": "Exaggerated superpower based on what it can do (5-12 words)",
  "lifeGoal": "Unnecessarily serious Manglish life goal (5-15 words)"
}`;

function lifeScriptUserPrompt(dna) {
  return `Generate the COMPLETE LIFE SCRIPT for this object.

Object: ${dna.name} (${dna.objectType})
Personality: ${dna.personality}
Strength: ${dna.strength}
Weakness: ${dna.weakness}
Fear: ${dna.fear}
Life Goal: ${dna.lifeGoal}

Return this EXACT JSON structure:
{
  "chapters": [
    {
      "scene": "Scene narration in Manglish (airport for ch1, etc)",
      "choiceA": {
        "label": "Short action (3-8 words)",
        "emoji": "emoji",
        "consequence": "Result narration in Manglish",
        "stateChanges": { "money": 10, "mood": "New mood", "condition": "New condition", "location": "New location" },
        "memory": "Short summary of what happened"
      },
      "choiceB": {
        "label": "Alternative action",
        "emoji": "emoji",
        "consequence": "Alternative result",
        "stateChanges": { "money": -5, "mood": "New mood", "condition": "New condition", "location": "New location" },
        "memory": "Short summary of alternative path"
      }
    }
  ],
  "death": {
    "scene": "Death narration in Manglish",
    "deathCause": "Specific cause (5-10 words)",
    "epitaph": "One-line funny epitaph",
    "eulogy": "2-3 sentence life summary in Manglish"
  }
}

NOTE: Generate exactly 4 items in the "chapters" array.`;
}

const IMAGE_USER_PROMPT = `Analyze this image. Identify the MAIN OBJECT shown (ignore people, backgrounds, hands).

Create its OFFICIAL PASSPORT IDENTITY for the Republic of Objects.

IMPORTANT: Make the humor OBJECT-SPECIFIC. A banana should have banana fears. A pen should have pen problems. A shoe should have shoe anxieties.

Return this EXACT JSON structure:
${PASSPORT_JSON_TEMPLATE}

Generate passportNumber as OBJ- followed by 5 random digits.
All text fields should use natural Manglish where funny.`;

function manualUserPrompt(objectName) {
  return `The object is: "${objectName}"

Create its OFFICIAL PASSPORT IDENTITY for the Republic of Objects.

IMPORTANT: Make the humor specific to what a "${objectName}" actually IS and DOES.

Return this EXACT JSON structure:
${PASSPORT_JSON_TEMPLATE}

Generate passportNumber as OBJ- followed by 5 random digits.
All text fields should use natural Manglish where funny.`;
}

// ═══════════════════════════════════════════════════════════════════
// GEMINI API CALLS
// ═══════════════════════════════════════════════════════════════════

async function callGeminiText(systemPrompt, userPrompt, label) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generation_config: {
      temperature: 0.85,
      max_output_tokens: 2048,
      response_mime_type: 'application/json',
    },
  };

  console.log(`[GEMINI] ${label}...`);
  const startTime = Date.now();

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API ${response.status}: ${errBody.substring(0, 300)}`);
  }

  const data = await response.json();
  console.log(`[GEMINI] ${label} done in ${Date.now() - startTime}ms`);

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('No content in Gemini response');

  const parsed = extractJSON(content);
  if (!parsed) throw new Error('Could not parse JSON from Gemini response');

  return parsed;
}

async function callGeminiImage(systemPrompt, userPrompt, base64Image, label) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const rawBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      parts: [
        { text: userPrompt },
        { inline_data: { mime_type: 'image/jpeg', data: rawBase64 } },
      ],
    }],
    generation_config: {
      temperature: 0.85,
      max_output_tokens: 2048,
      response_mime_type: 'application/json',
    },
  };

  console.log(`[GEMINI] ${label}...`);
  const startTime = Date.now();

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API ${response.status}: ${errBody.substring(0, 300)}`);
  }

  const data = await response.json();
  console.log(`[GEMINI] ${label} done in ${Date.now() - startTime}ms`);

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('No content in Gemini response');

  const parsed = extractJSON(content);
  if (!parsed) throw new Error('Could not parse JSON from Gemini response');

  return parsed;
}

// Gemini birth calls
async function callGeminiBirth(base64Image) {
  const raw = await callGeminiImage(COMEDY_SYSTEM_PROMPT, IMAGE_USER_PROMPT, base64Image, 'Birth (image)');
  return validateDNA(raw);
}

async function callGeminiManualBirth(objectName) {
  const raw = await callGeminiText(COMEDY_SYSTEM_PROMPT, manualUserPrompt(objectName), `Birth (${objectName})`);
  return validateDNA(raw);
}

// Gemini life script call
async function callGeminiLifeScript(dna) {
  const raw = await callGeminiText(LIFE_SCRIPT_SYSTEM_PROMPT, lifeScriptUserPrompt(dna), `Life Script`);
  return validateLifeScript(raw);
}

// ═══════════════════════════════════════════════════════════════════
// NVIDIA API CALLS
// ═══════════════════════════════════════════════════════════════════

async function callNvidiaText(systemPrompt, userPrompt, label) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY not set');

  const payload = {
    model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 2048,
    reasoning_budget: 2048,
    temperature: 0.85,
    top_p: 0.95,
    stream: false,
  };

  console.log(`[NVIDIA] ${label}...`);
  const startTime = Date.now();

  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`NVIDIA API ${response.status}: ${errBody.substring(0, 300)}`);
  }

  const data = await response.json();
  console.log(`[NVIDIA] ${label} done in ${Date.now() - startTime}ms`);

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content in NVIDIA response');

  const parsed = extractJSON(content);
  if (!parsed) throw new Error('Could not parse JSON from NVIDIA response');

  return parsed;
}

async function callNvidiaImage(systemPrompt, userPrompt, base64Image, label) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY not set');

  const imageUrl = base64Image.startsWith('data:')
    ? base64Image
    : `data:image/jpeg;base64,${base64Image}`;

  const payload = {
    model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    max_tokens: 2048,
    reasoning_budget: 2048,
    temperature: 0.85,
    top_p: 0.95,
    stream: false,
  };

  console.log(`[NVIDIA] ${label}...`);
  const startTime = Date.now();

  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`NVIDIA API ${response.status}: ${errBody.substring(0, 300)}`);
  }

  const data = await response.json();
  console.log(`[NVIDIA] ${label} done in ${Date.now() - startTime}ms`);

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content in NVIDIA response');

  const parsed = extractJSON(content);
  if (!parsed) throw new Error('Could not parse JSON from NVIDIA response');

  return parsed;
}

// NVIDIA birth calls
async function callNvidiaBirth(base64Image) {
  const raw = await callNvidiaImage(COMEDY_SYSTEM_PROMPT, IMAGE_USER_PROMPT, base64Image, 'Birth (image)');
  return validateDNA(raw);
}

async function callNvidiaManualBirth(objectName) {
  const raw = await callNvidiaText(COMEDY_SYSTEM_PROMPT, manualUserPrompt(objectName), `Birth (${objectName})`);
  return validateDNA(raw);
}

// NVIDIA life script call
async function callNvidiaLifeScript(dna) {
  const raw = await callNvidiaText(LIFE_SCRIPT_SYSTEM_PROMPT, lifeScriptUserPrompt(dna), `Life Script`);
  return validateLifeScript(raw);
}

// ═══════════════════════════════════════════════════════════════════
// JSON EXTRACTION + VALIDATION
// ═══════════════════════════════════════════════════════════════════

function extractJSON(text) {
  let cleaned = text
    .replace(/<unk>/g, '')
    .replace(/<\/s>/g, '')
    .replace(/<s>/g, '')
    .replace(/\r/g, '')
    .trim();

  try { return JSON.parse(cleaned); } catch (_e) { /* continue */ }

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch (_e) { /* continue */ }
  }

  const jsonStr = extractBracketMatched(cleaned);
  if (jsonStr) {
    try { return JSON.parse(jsonStr); } catch (_e) {
      const fixedStr = jsonStr
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/(["\d])\s+"/g, '$1, "');
      try { return JSON.parse(fixedStr); } catch (_e2) { /* continue */ }
    }
  }

  const greedyMatch = cleaned.match(/\{[\s\S]*\}/);
  if (greedyMatch) {
    try { return JSON.parse(greedyMatch[0]); } catch (_e) { /* continue */ }
  }

  return null;
}

function extractBracketMatched(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0, inString = false, escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString) {
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
  }

  const lastBrace = text.lastIndexOf('}');
  if (lastBrace > start) return text.slice(start, lastBrace + 1);
  return null;
}

// ─── DNA validation ──────────────────────────────────────────────
function validateDNA(raw) {
  const pno = 'OBJ-' + String(Math.floor(10000 + Math.random() * 90000));

  const defaults = {
    name: 'Unknown Entity',
    objectType: 'Unidentified',
    origin: 'Parts Unknown',
    dateOfBirth: 'Ariyilla... kure munpe',
    nationality: 'Vasthy (OBJECT)',
    passportNumber: pno,
    personality: 'Chill aanu. Aarkkum upadravam illa.',
    mood: 'Confused',
    strength: 'Survive cheyyum... somehow.',
    weakness: 'Existential crisis prone',
    fear: 'Being thrown away',
    ambition: 'Oru purpose kandethanam',
    backstory: 'Etho drawer-il ninnu kittiyatha. Aarkkum orma illa.',
    inability: 'Onnum thanne cheyyaan ariyilla',
    specialAbility: 'EXIST HARDER — Enne ignore cheyyaan pattilla',
    lifeGoal: 'Ardelum enne kandittu "ithu kollam" ennu parayanam',
  };

  const dna = { ...defaults, ...raw };

  if (raw.objectName && !raw.name) dna.name = raw.objectName;
  if (raw.kazivillazhma && !raw.inability) dna.inability = raw.kazivillazhma;
  if (raw.jeevithaLakshyam && !raw.lifeGoal) dna.lifeGoal = raw.jeevithaLakshyam;

  if (!dna.passportNumber.startsWith('OBJ-')) dna.passportNumber = pno;

  const maxLengths = {
    name: 25, objectType: 20, origin: 40, dateOfBirth: 30,
    nationality: 20, passportNumber: 12,
    personality: 60, mood: 30, strength: 60, weakness: 60,
    fear: 40, ambition: 60, inability: 60, specialAbility: 60,
    lifeGoal: 80, backstory: 120,
  };

  for (const [field, max] of Object.entries(maxLengths)) {
    if (typeof dna[field] === 'string' && dna[field].length > max) {
      dna[field] = dna[field].substring(0, max - 3) + '...';
    }
  }

  return dna;
}

// ─── Life Script validation ────────────────────────────────────────
function validateLifeScript(raw) {
  if (!raw || !Array.isArray(raw.chapters) || !raw.death) {
    throw new Error('Invalid life script structure');
  }

  const script = {
    chapters: [],
    death: {
      scene: raw.death.scene || 'Etho oru thettu sambhavichu. Life thernu.',
      deathCause: raw.death.deathCause || 'Unknown error',
      epitaph: raw.death.epitaph || 'Pavam',
      eulogy: raw.death.eulogy || 'Oru object aayirunnu, poyi.'
    }
  };

  for (const ch of raw.chapters) {
    script.chapters.push({
      scene: ch.scene || 'Strange situation.',
      choiceA: validateChoice(ch.choiceA),
      choiceB: validateChoice(ch.choiceB)
    });
  }

  return script;
}

function validateChoice(c) {
  if (!c) c = {};
  return {
    label: (c.label || 'Do something').substring(0, 40),
    emoji: c.emoji || '🤔',
    consequence: c.consequence || 'Entho sambhavichu...',
    stateChanges: c.stateChanges || {},
    memory: c.memory || 'Did something.'
  };
}

// ─── Fallback data (when AI fails) ───────────────────────────────
function getFallbackLifeScript(dna) {
  const name = dna?.name || 'Object';
  return {
    chapters: [
      {
        scene: `${name} airport-il ethi. Immigration officer suspiciously nokkunnundu. "Papers ready aano?"`,
        choiceA: { label: 'Confident ayi walk cheyyuka', emoji: '😎', consequence: 'Officer vishwasichu. Entry allowed.', stateChanges: { mood: 'Confident', money: 10 }, memory: 'Entered country safely' },
        choiceB: { label: 'Queue-il ninnu olikkuka', emoji: '🫣', consequence: 'Caught! Penalty adichu.', stateChanges: { mood: 'Scared', money: -20 }, memory: 'Got caught at airport' }
      },
      {
        scene: `Oru strange uncle ${name}-ne kandittu: "Nee enthaada ivide cheyyunne? Enikku oru help venam."`,
        choiceA: { label: 'Uncle-ne help cheyyuka', emoji: '🤝', consequence: 'Uncle happy aayi, tip thannu.', stateChanges: { money: 50, mood: 'Happy' }, memory: 'Helped a strange uncle' },
        choiceB: { label: '"Enikku aaryum ariyilla"', emoji: '🙅', consequence: 'Uncle poyi. You are alone.', stateChanges: { mood: 'Lonely' }, memory: 'Ignored someone in need' }
      },
      {
        scene: `${name}-nu oru job offer vannu — small shop-il. Salary kuravu, but food undu.`,
        choiceA: { label: 'Job accept cheyyuka', emoji: '💼', consequence: 'Boring aayirunnu, but safe.', stateChanges: { money: 100 }, memory: 'Got a boring job' },
        choiceB: { label: 'Better opp thappuka', emoji: '🔍', consequence: 'No jobs. Pattini.', stateChanges: { money: -30, condition: 'Tired' }, memory: 'Rejected job, starved' }
      },
      {
        scene: `Rathriyil oru shadowy figure ${name}-nte aduthu vannu: "Ninakku oru deal undu."`,
        choiceA: { label: 'Deal kelkkuka', emoji: '👂', consequence: 'Scam aayirunnu! Ellaam poyi.', stateChanges: { money: -500, condition: 'Broken' }, memory: 'Fell for a scam' },
        choiceB: { label: 'Odikkuka!', emoji: '🏃', consequence: 'Rakshapettu, but injured.', stateChanges: { condition: 'Scratched' }, memory: 'Ran for life' }
      }
    ],
    death: {
      scene: `Time kooduthal aayi. ${name} aa pazhaya sadharana object aayi thirichu poyi.`,
      deathCause: 'Time caught up',
      epitaph: 'Jeevichathu oru valiya karyam',
      eulogy: `${name} orikkalum marakkilla. Oru object aanenkilum jeevitham anubhavichu.`
    }
  };
}

// ─── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎮 ENNE KOLLAND IRIKKAN PATTO? — Server on port ${PORT}`);
  console.log(`   NVIDIA: ${process.env.NVIDIA_API_KEY ? '✓' : '✗'}  Gemini: ${process.env.GEMINI_API_KEY ? '✓' : '✗'}`);
  console.log(`   RACE MODE: Both AIs fire simultaneously, fastest valid response wins\n`);
});
