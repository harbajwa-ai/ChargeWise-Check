// Cloudflare Pages Function — handles POST /api/analyze
// Runs on Workers AI (free tier), bound via the dashboard: Settings > Functions > Bindings > Add > Workers AI.

const MODEL = "@cf/meta/llama-3.1-8b-instruct";
// If Cloudflare retires this model, check https://developers.cloudflare.com/workers-ai/models/
// for a current instruct model and swap the string above.

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// Workers AI instruct models sometimes wrap JSON in prose or a code fence.
// Pull out the first {...} block rather than trusting the whole reply is JSON.
function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model output");
  return JSON.parse(text.slice(start, end + 1));
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.AI) {
    return jsonResponse({ error: "AI binding not configured. Add it in Settings > Functions > Bindings." }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid request body" }, 400); }

  const { propertyType, region, unitCount, hasLift, hasStaff, notes, charges } = body;
  if (!Array.isArray(charges) || charges.length === 0) {
    return jsonResponse({ error: "No charges provided" }, 400);
  }

  const total = charges.reduce((s, c) => s + (parseInt(String(c.amount).replace(/[^\d]/g, ""), 10) || 0), 0);
  const units = parseInt(unitCount, 10) || null;
  const perFlat = units ? Math.round(total / units) : null;
  const chargeLines = charges.map(c => `- ${c.label}: ${c.amount}/year`).join("\n");

  const prompt = `You are a pragmatic UK leasehold expert helping a leaseholder assess whether their service charge is reasonable, applying the Section 19 Landlord and Tenant Act 1985 standard (charges must be "reasonably incurred" and services/works of a "reasonable standard"). Reply with ONLY a JSON object, no other text, no markdown fence.

Building profile:
- Type: ${propertyType || "a leasehold flat"}
- Region: ${region || "not specified"}
- Number of flats: ${unitCount || "not specified"}
- Lift on site: ${hasLift ? "yes" : "no"}
- Staff/concierge on site: ${hasStaff ? "yes" : "no"}
- Total service charge: £${total}/year${perFlat ? ` (£${perFlat} per flat/year)` : ""}

Charges on the bill:
${chargeLines}

Other context from the leaseholder: ${notes || "none"}

Reply with ONLY a JSON object of this exact shape:
{
  "summary": "one sentence overall verdict, hedged appropriately (this is general guidance, not a legal ruling)",
  "items": [
    { "label": "the charge name as given", "value": "the amount restated, e.g. £420", "verdict": "flag" | "fine" | "unclear", "note": "one or two sentences of reasoning, benchmarked against typical costs for a building of this size/type/region with these facilities" }
  ],
  "letter": "a complete, ready-to-send letter in British English to the managing agent/freeholder, polite but direct, querying only the charges marked flag or unclear, citing Section 19 where relevant, requesting an itemised breakdown, 120-180 words, addressed 'Dear [Managing Agent / Freeholder],' and signed '[Your name]'"
}
Only mark something "flag" if it looks genuinely high against realistic UK norms for this type of building. Ground every note in realistic figures, not vague reassurance.`;

  try {
    const aiResult = await env.AI.run(MODEL, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1200
    });
    const parsed = extractJson(aiResult.response);
    return jsonResponse(parsed);
  } catch (err) {
    return jsonResponse({ error: "Analysis failed", detail: String(err) }, 500);
  }
}
