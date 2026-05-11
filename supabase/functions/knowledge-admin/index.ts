const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type KnowledgeChunk = {
  title: string;
  content: string;
  category?: string;
  keywords?: string[];
  diagnosis_tags?: string[];
  source_name?: string;
  source_page?: number | null;
  active?: boolean;
};

type AdminAiConfig = {
  provider: string;
  api_key: string;
  model: string;
  gemini_fallback_api_key?: string | null;
  gemini_fallback_model?: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function assertAdmin(payload: Record<string, unknown>) {
  const expectedUser = Deno.env.get("ADMIN_USERNAME") || "admin";
  const expectedPassword = Deno.env.get("ADMIN_PASSWORD") || "";
  if (payload.username !== expectedUser || payload.password !== expectedPassword) {
    throw new Error("Login admin tidak valid");
  }
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diset");
  }
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Supabase REST ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}

function sanitizeChunk(chunk: KnowledgeChunk) {
  return {
    title: String(chunk.title || "").trim(),
    content: String(chunk.content || "").trim(),
    category: chunk.category ? String(chunk.category).trim() : null,
    keywords: normalizeList(chunk.keywords),
    diagnosis_tags: normalizeList(chunk.diagnosis_tags),
    source_name: chunk.source_name ? String(chunk.source_name).trim() : null,
    source_page: Number.isFinite(chunk.source_page) ? chunk.source_page : null,
    active: chunk.active !== false,
  };
}

function buildSearchFilter(keywords: string[]) {
  const clean = keywords.map((item) => item.toLowerCase().replace(/[^a-z0-9_\-\s]/gi, "").trim()).filter(Boolean);
  if (!clean.length) return "active=eq.true&order=updated_at.desc&limit=15";
  const orParts = clean.flatMap((keyword) => [
    `title.ilike.*${encodeURIComponent(keyword)}*`,
    `content.ilike.*${encodeURIComponent(keyword)}*`,
    `keywords.cs.{${encodeURIComponent(keyword)}}`,
    `diagnosis_tags.cs.{${encodeURIComponent(keyword)}}`,
  ]);
  return `active=eq.true&or=(${orParts.join(",")})&limit=30`;
}

function sanitizeAiConfig(config: Record<string, unknown>) {
  const provider = String(config.provider || "gemini").trim();
  const apiKey = String(config.api_key || config.apiKey || "").trim();
  const model = String(config.model || "").trim();
  if (!["gemini", "sumopod", "aimurah"].includes(provider)) throw new Error("Provider admin tidak dikenal");
  if (!apiKey) throw new Error("API key admin wajib diisi");
  if (!model) throw new Error("Model admin wajib diisi");
  return {
    id: "default",
    provider,
    api_key: apiKey,
    model,
    gemini_fallback_api_key: String(config.gemini_fallback_api_key || config.geminiFallbackApiKey || "").trim() || null,
    gemini_fallback_model: String(config.gemini_fallback_model || config.geminiFallbackModel || "gemini-2.0-flash").trim(),
    updated_at: new Date().toISOString(),
  };
}

function publicAiConfig(config: AdminAiConfig | null) {
  if (!config) return null;
  return {
    provider: config.provider,
    model: config.model,
    hasApiKey: Boolean(config.api_key),
    hasGeminiFallback: Boolean(config.gemini_fallback_api_key),
    geminiFallbackModel: config.gemini_fallback_model || "gemini-2.0-flash",
  };
}

async function getAdminAiConfig(): Promise<AdminAiConfig | null> {
  const rows = await supabaseRequest("admin_ai_config?select=*&id=eq.default&limit=1", {
    method: "GET",
    headers: { Prefer: "" },
  });
  return rows?.[0] || null;
}

async function callGemini(config: AdminAiConfig, payload: Record<string, unknown>) {
  const responseSchema = payload.responseSchema;
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: String(payload.userPrompt || payload.prompt || "") }] }],
    generationConfig: {
      temperature: Number(payload.temperature ?? 0.2),
    },
  };
  if (payload.systemPrompt) body.systemInstruction = { parts: [{ text: String(payload.systemPrompt) }] };
  if (payload.responseJson) {
    body.generationConfig = {
      ...(body.generationConfig as Record<string, unknown>),
      responseMimeType: "application/json",
      ...(responseSchema ? { responseSchema } : {}),
    };
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.api_key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${text.slice(0, 200)}`);
  const data = JSON.parse(text);
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOpenAiCompatible(config: AdminAiConfig, payload: Record<string, unknown>) {
  const endpoints: Record<string, string> = {
    sumopod: "https://ai.sumopod.com/v1/chat/completions",
    aimurah: "https://aimurah.my.id/api/v1/chat/completions",
  };
  const endpoint = endpoints[config.provider];
  if (!endpoint) throw new Error("Provider admin tidak mendukung format OpenAI-compatible");
  const messages = [];
  if (payload.systemPrompt) messages.push({ role: "system", content: String(payload.systemPrompt) });
  messages.push({ role: "user", content: String(payload.userPrompt || payload.prompt || "") });
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.api_key}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: Number(payload.temperature ?? 0.2),
      ...(payload.responseJson ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Provider API ${res.status}: ${text.slice(0, 200)}`);
  const data = JSON.parse(text);
  return data?.choices?.[0]?.message?.content || "";
}

async function callAdminAi(payload: Record<string, unknown>) {
  const config = await getAdminAiConfig();
  if (!config?.api_key) throw new Error("API key admin belum diset");
  const text = config.provider === "gemini"
    ? await callGemini(config, payload)
    : await callOpenAiCompatible(config, payload);
  if (!String(text || "").trim()) throw new Error("Respons AI admin kosong");
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const payload = await req.json();
    const action = payload.action;

    if (action === "login") {
      assertAdmin(payload);
      return json({ ok: true });
    }

    if (action === "search") {
      const keywords = normalizeList(payload.keywords);
      const data = await supabaseRequest(`knowledge_chunks?select=*&${buildSearchFilter(keywords)}`, {
        method: "GET",
        headers: { Prefer: "" },
      });
      return json({ chunks: data || [] });
    }

    if (action === "get_ai_config") {
      const config = await getAdminAiConfig();
      return json({ config: publicAiConfig(config) });
    }

    if (action === "ai_generate") {
      const text = await callAdminAi(payload);
      return json({ text });
    }

    assertAdmin(payload);

    if (action === "save_ai_config") {
      const config = sanitizeAiConfig(payload.config || {});
      const data = await supabaseRequest("admin_ai_config?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(config),
      });
      return json({ config: publicAiConfig(data?.[0] || config) });
    }

    if (action === "validate_ai_config") {
      const config = sanitizeAiConfig(payload.config || {});
      const text = config.provider === "gemini"
        ? await callGemini(config, { prompt: "Balas OK.", temperature: 0 })
        : await callOpenAiCompatible(config, { prompt: "Balas OK.", temperature: 0 });
      return json({ ok: true, preview: String(text || "").slice(0, 40) });
    }

    if (action === "create") {
      const chunk = sanitizeChunk(payload.chunk || {});
      if (!chunk.title || !chunk.content) throw new Error("Judul dan isi knowledge wajib diisi");
      const data = await supabaseRequest("knowledge_chunks", {
        method: "POST",
        body: JSON.stringify(chunk),
      });
      return json({ chunk: data?.[0] || null });
    }

    if (action === "bulk_create") {
      const chunks = (payload.chunks || []).map(sanitizeChunk).filter((chunk: KnowledgeChunk) => chunk.title && chunk.content);
      if (!chunks.length) throw new Error("Tidak ada chunk valid untuk disimpan");
      const data = await supabaseRequest("knowledge_chunks", {
        method: "POST",
        body: JSON.stringify(chunks),
      });
      return json({ chunks: data || [] });
    }

    if (action === "list") {
      const data = await supabaseRequest("knowledge_chunks?select=*&order=updated_at.desc&limit=50", {
        method: "GET",
        headers: { Prefer: "" },
      });
      return json({ chunks: data || [] });
    }

    if (action === "update") {
      const id = String(payload.id || "");
      if (!id) throw new Error("ID wajib diisi");
      const patch = sanitizeChunk(payload.chunk || {});
      const data = await supabaseRequest(`knowledge_chunks?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
      });
      return json({ chunk: data?.[0] || null });
    }

    if (action === "delete") {
      const id = String(payload.id || "");
      if (!id) throw new Error("ID wajib diisi");
      await supabaseRequest(`knowledge_chunks?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return json({ ok: true });
    }

    return json({ error: "Action tidak dikenal" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 400);
  }
});
