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

export async function groq(prompt, { max = 3500, temperature = 0.7, key = process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY } = {}) {
  if (!key) throw new Error('GROQ_API_KEY is missing');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: max,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`Groq API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

// Script writer: Claude if available, otherwise Groq.
export async function director(prompt, opts) {
  const provider = process.env.SCRIPT_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'claude' : 'groq');
  return provider === 'claude' ? claude(prompt, opts) : groq(prompt, opts);
}
