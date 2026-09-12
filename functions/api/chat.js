// Cloudflare Pages Function — handles POST /api/chat
// Runs on Workers AI (free tier), bound via the dashboard: Settings > Functions > Bindings > Add > Workers AI.

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const CHAT_INSTRUCTIONS = `You are a specialist assistant on UK leasehold service charges. You only help with: Section 19 of the Landlord and Tenant Act 1985 (the "reasonably incurred" / "reasonable standard" test), Section 20 consultation requirements for major works, reserve/sinking funds, the First-tier Tribunal (Property Chamber) process, and general leaseholder rights around service charges and disputing them. Answer concisely in plain English, normally 2-5 sentences. If asked something outside this domain, say briefly that it's outside what you cover and redirect to what you can help with. Whenever a question touches on a specific dispute or formal action, make clear this is general information, not formal legal advice, and that a solicitor or LEASE (the free Leasehold Advisory Service) can help further.`;

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.AI) {
    return jsonResponse({ error: "AI binding not configured. Add it in Settings > Functions > Bindings." }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid request body" }, 400); }

  const turns = Array.isArray(body.turns) ? body.turns : [];
  if (!turns.length) return jsonResponse({ error: "No message provided" }, 400);

  const messages = [{ role: "system", content: CHAT_INSTRUCTIONS }, ...turns];

  try {
    const aiResult = await env.AI.run(MODEL, { messages, max_tokens: 400 });
    return jsonResponse({ reply: aiResult.response });
  } catch (err) {
    return jsonResponse({ error: "Chat failed", detail: String(err) }, 500);
  }
}
