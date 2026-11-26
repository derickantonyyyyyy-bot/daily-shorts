// Small helpers for the two LLM providers used in the pipeline.
//   Claude -> directing (script, staging)       needs ANTHROPIC_API_KEY
//   Groq   -> modelling props as 3D primitives  needs GROQ_API_KEY
// If ANTHROPIC_API_KEY is missing, Groq writes the script too.

export function parseJson(raw) {
  const s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(s);
}

export async function claude(prompt, { max = 3500 } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is missing');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
      max_tokens: max,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content.map((c) => c.text || '').join('');
}

// Models are tried in order; the first one this key can use wins (cached per key for the rest of the run).
// Groq orgs can block individual models, which shows up as 404 model_not_found. Override with GROQ_MODEL.
const GROQ_MODELS = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
const goodModel = new Map();

export async function groq(prompt, { max = 3500, temperature = 0.7, key = process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY } = {}) {
  if (!key) throw new Error('GROQ_API_KEY is missing');
  const candidates = goodModel.has(key)
    ? [goodModel.get(key)]
    : [...new Set([process.env.GROQ_MODEL, ...GROQ_MODELS].filter(Boolean))];
  let lastErr;
  for (const model of candidates) {
    const body = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: max,
      response_format: { type: 'json_object' },
    };
    if (model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low'; // keep the token budget for the answer
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      goodModel.set(key, model);
      const data = await res.json();
      return data.choices[0].message.content;
    }
    const text = await res.text();
    lastErr = new Error(`Groq API ${res.status} (${model}): ${text}`);
    const modelProblem = res.status === 404 || /model_not_found|decommissioned|does not exist/i.test(text);
    if (!modelProblem) throw lastErr; // rate limit, bad key, etc: do not hide it behind a model switch
    console.warn(`Groq model ${model} unavailable for this key, trying the next one`);
  }
  throw lastErr;
}
export async function director(prompt, opts) {
  const provider = process.env.SCRIPT_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'claude' : 'groq');
  return provider === 'claude' ? claude(prompt, opts) : groq(prompt, opts);
}
