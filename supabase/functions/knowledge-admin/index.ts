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
  id?: string;
  app_id?: string;
  provider: string;
  provider_label?: string | null;
  base_url?: string | null;
  api_key: string;
  model: string;
  active?: boolean;
  gemini_fallback_api_key?: string | null;
  gemini_fallback_model?: string | null;
};

type AdminAiUser = {
  id?: string;
  username: string;
  password_hash: string;
  active?: boolean;
  active_device_id?: string | null;
  session_token?: string | null;
  session_expires_at?: string | null;
};

const OPENAI_ENDPOINTS: Record<string, string> = {
  sumopod: "https://ai.sumopod.com/v1/chat/completions",
  aimurah: "https://aimurah.my.id/api/v1/chat/completions",
  genfity: "https://ai.genfity.com/v1/chat/completions",
  x5lab: "https://api.x5lab.dev/v1/chat/completions",
};

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  sumopod: "Sumopod",
  aimurah: "AIMurah",
  genfity: "Genfity",
  x5lab: "X5Lab",
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

function getAppId(payload: Record<string, unknown>) {
  const appId = String(payload.app_id || payload.appId || "resume-medis-reviewer").trim();
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(appId)) throw new Error("app_id tidak valid");
  return appId;
}

function normalizeProviderKey(value: unknown) {
  const provider = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(provider)) throw new Error("Provider admin tidak valid");
  return provider;
}

function normalizeUsername(value: unknown) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,64}$/i.test(username)) {
    throw new Error("Username tidak valid");
  }
  return username;
}

async function hashPassword(password: string, username: string) {
  const pepper = Deno.env.get("ADMIN_USER_PASSWORD_PEPPER") || "";
  const payload = new TextEncoder().encode(`${username}::${password}::${pepper}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function makeSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getSessionExpiryIso(days = 7) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt.toISOString();
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

function sanitizeAiConfig(config: Record<string, unknown>, appId: string, existing?: AdminAiConfig | null) {
  const provider = normalizeProviderKey(config.provider || "gemini");
  const providerLabel = String(config.provider_label || config.providerLabel || "").trim();
  const baseUrl = String(config.base_url || config.baseUrl || "").trim();
  const apiKey = String(config.api_key || config.apiKey || "").trim() || existing?.api_key || "";
  const model = String(config.model || existing?.model || "").trim();
  if (provider !== "gemini") {
    const endpoint = baseUrl || existing?.base_url || OPENAI_ENDPOINTS[provider] || "";
    if (!endpoint) throw new Error("Endpoint provider admin wajib diisi");
    if (!/^https?:\/\//i.test(endpoint)) throw new Error("Endpoint provider admin harus berupa URL http/https");
  }
  if (!apiKey) throw new Error("API key admin wajib diisi");
  if (!model) throw new Error("Model admin wajib diisi");
  return {
    id: appId,
    app_id: appId,
    provider,
    provider_label: providerLabel || PROVIDER_LABELS[provider] || provider,
    base_url: provider === "gemini" ? null : (baseUrl || existing?.base_url || OPENAI_ENDPOINTS[provider] || null),
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
    app_id: config.app_id || config.id || "resume-medis-reviewer",
    provider: config.provider,
    providerLabel: config.provider_label || null,
    baseUrl: config.base_url || null,
    model: config.model,
    hasApiKey: Boolean(config.api_key),
    hasGeminiFallback: Boolean(config.gemini_fallback_api_key),
    geminiFallbackModel: config.gemini_fallback_model || "gemini-2.0-flash",
  };
}

function publicProvider(config: AdminAiConfig) {
  return {
    provider: config.provider,
    providerLabel: config.provider_label || PROVIDER_LABELS[config.provider] || config.provider,
    baseUrl: config.base_url || OPENAI_ENDPOINTS[config.provider] || null,
    model: config.model,
    active: config.active === true,
    hasApiKey: Boolean(config.api_key),
    hasGeminiFallback: Boolean(config.gemini_fallback_api_key),
    geminiFallbackModel: config.gemini_fallback_model || "gemini-2.0-flash",
  };
}

async function getAdminAiConfig(appId: string): Promise<AdminAiConfig | null> {
  const providerRows = await supabaseRequest(`admin_ai_providers?select=*&app_id=eq.${encodeURIComponent(appId)}&active=eq.true&limit=1`, {
    method: "GET",
    headers: { Prefer: "" },
  });
  if (providerRows?.[0]) return providerRows[0];

  const rows = await supabaseRequest(`admin_ai_config?select=*&app_id=eq.${encodeURIComponent(appId)}&limit=1`, {
    method: "GET",
    headers: { Prefer: "" },
  });
  return rows?.[0] || null;
}

async function getAdminAiProvider(appId: string, provider: string): Promise<AdminAiConfig | null> {
  const rows = await supabaseRequest(`admin_ai_providers?select=*&app_id=eq.${encodeURIComponent(appId)}&provider=eq.${encodeURIComponent(provider)}&limit=1`, {
    method: "GET",
    headers: { Prefer: "" },
  });
  return rows?.[0] || null;
}

async function listAdminAiProviders(appId: string): Promise<AdminAiConfig[]> {
  const rows = await supabaseRequest(`admin_ai_providers?select=*&app_id=eq.${encodeURIComponent(appId)}&order=provider.asc`, {
    method: "GET",
    headers: { Prefer: "" },
  });
  return rows || [];
}

async function getAdminAiUser(username: string): Promise<AdminAiUser | null> {
  const rows = await supabaseRequest(`admin_ai_users?select=*&username=eq.${encodeURIComponent(username)}&limit=1`, {
    method: "GET",
    headers: { Prefer: "" },
  });
  return rows?.[0] || null;
}

async function listAdminAiUsers(): Promise<AdminAiUser[]> {
  const rows = await supabaseRequest("admin_ai_users?select=*&order=username.asc", {
    method: "GET",
    headers: { Prefer: "" },
  });
  return rows || [];
}

function publicAdminUser(user: AdminAiUser) {
  return {
    id: user.id,
    username: user.username,
    active: user.active !== false,
    hasActiveDevice: Boolean(user.active_device_id),
    sessionExpiresAt: user.session_expires_at || null,
  };
}

async function createAdminAiUser(payload: Record<string, unknown>) {
  const userPayload = (payload.user && typeof payload.user === "object" ? payload.user : payload) as Record<string, unknown>;
  const username = normalizeUsername(userPayload.username);
  const password = String(userPayload.password || "").trim();
  if (password.length < 4) throw new Error("Password minimal 4 karakter");
  const existing = await getAdminAiUser(username);
  if (existing) throw new Error("Username sudah terdaftar");
  const user = {
    username,
    password_hash: await hashPassword(password, username),
    active: true,
    active_device_id: null,
    session_token: null,
    session_expires_at: null,
    updated_at: new Date().toISOString(),
  };
  const rows = await supabaseRequest("admin_ai_users", {
    method: "POST",
    body: JSON.stringify(user),
  });
  return rows?.[0] || user;
}

async function resetAdminAiUserPassword(payload: Record<string, unknown>) {
  const userPayload = (payload.user && typeof payload.user === "object" ? payload.user : payload) as Record<string, unknown>;
  const username = normalizeUsername(userPayload.username);
  const password = String(userPayload.password || "").trim();
  if (password.length < 4) throw new Error("Password minimal 4 karakter");
  const existing = await getAdminAiUser(username);
  if (!existing) throw new Error("Username tidak terdaftar");
  const rows = await supabaseRequest(`admin_ai_users?username=eq.${encodeURIComponent(username)}`, {
    method: "PATCH",
    body: JSON.stringify({
      password_hash: await hashPassword(password, username),
      active_device_id: null,
      session_token: null,
      session_expires_at: null,
      updated_at: new Date().toISOString(),
    }),
  });
  return rows?.[0] || null;
}

async function deleteAdminAiUser(payload: Record<string, unknown>) {
  const userPayload = (payload.user && typeof payload.user === "object" ? payload.user : payload) as Record<string, unknown>;
  const username = normalizeUsername(userPayload.username);
  await supabaseRequest(`admin_ai_users?username=eq.${encodeURIComponent(username)}`, {
    method: "DELETE",
  });
}

async function loginAdminAiUser(payload: Record<string, unknown>) {
  const username = normalizeUsername(payload.username);
  const password = String(payload.password || "").trim();
  const deviceId = String(payload.device_id || payload.deviceId || "").trim();
  if (!deviceId) throw new Error("Device ID tidak ditemukan");
  const user = await getAdminAiUser(username);
  if (!user || user.active === false) throw new Error("Username tidak terdaftar");
  const passwordHash = await hashPassword(password, username);
  if (passwordHash !== user.password_hash) throw new Error("Password salah");
  const session_token = makeSessionToken();
  const session_expires_at = getSessionExpiryIso(7);
  const rows = await supabaseRequest(`admin_ai_users?username=eq.${encodeURIComponent(username)}`, {
    method: "PATCH",
    body: JSON.stringify({
      active_device_id: deviceId,
      session_token,
      session_expires_at,
      updated_at: new Date().toISOString(),
    }),
  });
  const saved = rows?.[0] || { ...user, active_device_id: deviceId, session_token, session_expires_at };
  return {
    username: saved.username,
    sessionToken: saved.session_token,
    deviceId: saved.active_device_id,
    expiresAt: saved.session_expires_at,
  };
}

async function validateAdminAiUserSession(payload: Record<string, unknown>) {
  const username = normalizeUsername(payload.username);
  const deviceId = String(payload.device_id || payload.deviceId || "").trim();
  const sessionToken = String(payload.session_token || payload.sessionToken || "").trim();
  if (!deviceId || !sessionToken) throw new Error("Sesi login belum lengkap");
  const user = await getAdminAiUser(username);
  if (!user || user.active === false) throw new Error("Username tidak terdaftar");
  if (user.session_token !== sessionToken || user.active_device_id !== deviceId) {
    throw new Error("Sesi admin di perangkat ini sudah tidak aktif. Silakan login ulang.");
  }
  if (!user.session_expires_at || new Date(user.session_expires_at).getTime() < Date.now()) {
    throw new Error("Sesi admin sudah berakhir. Silakan login ulang.");
  }
  return {
    username: user.username,
    deviceId: user.active_device_id,
    expiresAt: user.session_expires_at,
  };
}

async function logoutAdminAiUser(payload: Record<string, unknown>) {
  const username = normalizeUsername(payload.username);
  const user = await getAdminAiUser(username);
  if (!user) return;
  await supabaseRequest(`admin_ai_users?username=eq.${encodeURIComponent(username)}`, {
    method: "PATCH",
    body: JSON.stringify({
      active_device_id: null,
      session_token: null,
      session_expires_at: null,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function saveAdminAiProvider(config: AdminAiConfig) {
  await supabaseRequest(`admin_ai_providers?app_id=eq.${encodeURIComponent(config.app_id || config.id || "")}`, {
    method: "PATCH",
    body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }),
  });
  const providerPayload = {
    app_id: config.app_id || config.id || "",
    provider: config.provider,
    provider_label: config.provider_label || null,
    base_url: config.base_url || null,
    api_key: config.api_key,
    model: config.model,
    active: true,
    gemini_fallback_api_key: config.gemini_fallback_api_key || null,
    gemini_fallback_model: config.gemini_fallback_model || "gemini-2.0-flash",
    updated_at: new Date().toISOString(),
  };
  const data = await supabaseRequest("admin_ai_providers?on_conflict=app_id,provider", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(providerPayload),
  });
  await supabaseRequest("admin_ai_config?on_conflict=app_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(config),
  });
  return data?.[0] || providerPayload;
}

async function resetAdminAiProvider(appId: string, provider: string) {
  const existing = await getAdminAiProvider(appId, provider);
  if (!existing) throw new Error("Provider admin belum tersimpan");
  const patch = {
    api_key: "",
    gemini_fallback_api_key: null,
    updated_at: new Date().toISOString(),
  };
  const providerRows = await supabaseRequest(
    `admin_ai_providers?app_id=eq.${encodeURIComponent(appId)}&provider=eq.${encodeURIComponent(provider)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    }
  );
  const providerConfig = providerRows?.[0] || { ...existing, ...patch };
  const mirrorConfig = {
    id: appId,
    app_id: appId,
    provider: existing.provider,
    provider_label: existing.provider_label || null,
    base_url: existing.base_url || null,
    api_key: "",
    model: existing.model,
    gemini_fallback_api_key: null,
    gemini_fallback_model: existing.gemini_fallback_model || "gemini-2.0-flash",
    updated_at: new Date().toISOString(),
  };
  await supabaseRequest("admin_ai_config?on_conflict=app_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(mirrorConfig),
  });
  const providers = await listAdminAiProviders(appId);
  return {
    config: publicAiConfig(providerConfig),
    providers: providers.map(publicProvider),
  };
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
  const endpoint = String(config.base_url || OPENAI_ENDPOINTS[config.provider] || "").trim();
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
  await validateAdminAiUserSession(payload.user_session || {});
  const appId = getAppId(payload);
  const config = await getAdminAiConfig(appId);
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
      const appId = getAppId(payload);
      const config = await getAdminAiConfig(appId);
      const providers = await listAdminAiProviders(appId);
      return json({ config: publicAiConfig(config), providers: providers.map(publicProvider) });
    }

    if (action === "ai_generate") {
      const text = await callAdminAi(payload);
      return json({ text });
    }

    if (action === "login_user") {
      return json({ session: await loginAdminAiUser(payload) });
    }

    if (action === "validate_user_session") {
      return json({ session: await validateAdminAiUserSession(payload) });
    }

    if (action === "logout_user") {
      await logoutAdminAiUser(payload);
      return json({ ok: true });
    }

    assertAdmin(payload);

    if (action === "list_users") {
      const users = await listAdminAiUsers();
      return json({ users: users.map(publicAdminUser) });
    }

    if (action === "create_user") {
      const user = await createAdminAiUser(payload);
      return json({ user: publicAdminUser(user) });
    }

    if (action === "reset_user_password") {
      const user = await resetAdminAiUserPassword(payload);
      return json({ user: user ? publicAdminUser(user) : null });
    }

    if (action === "delete_user") {
      await deleteAdminAiUser(payload);
      return json({ ok: true });
    }

    if (action === "save_ai_config") {
      const appId = getAppId(payload);
      const incoming = (payload.config || {}) as Record<string, unknown>;
      const provider = normalizeProviderKey(incoming.provider || "gemini");
      const existing = await getAdminAiProvider(appId, provider);
      const config = sanitizeAiConfig(incoming, appId, existing);
      const saved = await saveAdminAiProvider(config);
      const providers = await listAdminAiProviders(appId);
      return json({ config: publicAiConfig(saved), providers: providers.map(publicProvider) });
    }

    if (action === "validate_ai_config") {
      const appId = getAppId(payload);
      const incoming = (payload.config || {}) as Record<string, unknown>;
      const provider = normalizeProviderKey(incoming.provider || "gemini");
      const existing = await getAdminAiProvider(appId, provider);
      const config = sanitizeAiConfig(incoming, appId, existing);
      const text = config.provider === "gemini"
        ? await callGemini(config, { prompt: "Balas OK.", temperature: 0 })
        : await callOpenAiCompatible(config, { prompt: "Balas OK.", temperature: 0 });
      return json({ ok: true, preview: String(text || "").slice(0, 40) });
    }

    if (action === "reset_ai_config") {
      const appId = getAppId(payload);
      const provider = normalizeProviderKey(payload.provider || (await getAdminAiConfig(appId))?.provider || "gemini");
      return json(await resetAdminAiProvider(appId, provider));
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
