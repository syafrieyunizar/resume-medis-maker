# Panduan Implementasi API Key Pribadi dan Admin

Dokumen ini menjelaskan pola API key pada extension `resume-medis-reviewer` agar bisa diterapkan ke aplikasi lain dengan Supabase yang sama.

## Tujuan

Aplikasi mendukung dua sumber API key:

- **API key pribadi**: disimpan lokal di browser/perangkat user.
- **API key admin**: disimpan terpusat di Supabase, dipakai melalui Edge Function, dan tidak pernah dikirim ke frontend.

Setiap aplikasi dibedakan dengan `app_id`, sehingga Supabase yang sama bisa menyimpan konfigurasi admin berbeda untuk beberapa aplikasi.

Contoh `app_id` yang sudah dipakai:

```text
resume-medis-reviewer
eklaim-koding-assistant
soap-gen
icd-search-helper
```

## Prinsip Arsitektur

```text
Frontend
  +- mode personal: panggil provider AI langsung dengan API key lokal
  +- mode admin: panggil Supabase Edge Function
         +- Edge Function validasi session user
         +- Edge Function ambil API key admin sesuai app_id
         +- Edge Function panggil provider AI
```

Aturan penting:

- Frontend boleh menyimpan API key pribadi.
- Frontend tidak boleh menerima API key admin.
- API key admin hanya dipakai di Edge Function.
- Semua request admin wajib membawa `app_id`.
- Sesi user admin disimpan lokal di browser, tetapi divalidasi ke backend sebelum AI dipakai.

## Backend Supabase

### Tabel Wajib

Gunakan tabel yang sudah ada pada Supabase ini.

#### `admin_ai_config`

Mirror konfigurasi aktif per aplikasi.

Kolom penting:

```sql
app_id text unique
provider text
provider_label text
base_url text
api_key text
model text
gemini_fallback_api_key text
gemini_fallback_model text
updated_at timestamptz
```

#### `admin_ai_providers`

Menyimpan daftar provider per aplikasi. Satu provider aktif per `app_id`.

Kolom penting:

```sql
app_id text not null
provider text not null
provider_label text
base_url text
api_key text
model text
active boolean
gemini_fallback_api_key text
gemini_fallback_model text
unique (app_id, provider)
```

Index penting:

```sql
create unique index admin_ai_providers_active_app_idx
on public.admin_ai_providers (app_id)
where active = true;
```

#### `admin_ai_users`

User yang boleh memakai API key admin.

Kolom penting:

```sql
username text unique
password_hash text
active boolean
active_device_id text
session_token text
session_expires_at timestamptz
```

Implementasi saat ini memakai **1 akun = 1 device aktif**. Login di device baru akan mematikan sesi device lama.

## Edge Function

Function yang dipakai saat ini:

```text
https://yvcqgwpfjoxhuyhxuiry.supabase.co/functions/v1/knowledge-admin
```

Frontend memanggil function dengan header anon key:

```js
headers: {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
}
```

Service role key hanya ada di secret Edge Function:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_USERNAME
ADMIN_PASSWORD
ADMIN_USER_PASSWORD_PEPPER
```

Jangan hardcode service role key di frontend.

## Action Edge Function

### `get_ai_config`

Ambil konfigurasi admin publik untuk `app_id`.

Request:

```json
{
  "action": "get_ai_config",
  "app_id": "nama-app"
}
```

Response tidak boleh berisi API key asli:

```json
{
  "config": {
    "app_id": "nama-app",
    "provider": "gemini",
    "providerLabel": "Gemini",
    "baseUrl": null,
    "model": "gemini-2.0-flash",
    "hasApiKey": true,
    "hasGeminiFallback": false,
    "geminiFallbackModel": "gemini-2.0-flash"
  },
  "providers": []
}
```

### `login_user`

Login user agar boleh memakai API key admin.

Request:

```json
{
  "action": "login_user",
  "app_id": "nama-app",
  "username": "laptopA",
  "password": "laptopA",
  "device_id": "uuid-device"
}
```

Response:

```json
{
  "session": {
    "username": "laptopa",
    "sessionToken": "...",
    "deviceId": "uuid-device",
    "expiresAt": "2026-07-17T00:00:00.000Z"
  }
}
```

### `validate_user_session`

Validasi sesi sebelum memakai admin API key.

Request:

```json
{
  "action": "validate_user_session",
  "app_id": "nama-app",
  "username": "laptopa",
  "session_token": "...",
  "device_id": "uuid-device"
}
```

Jika session token atau device berbeda, backend menolak.

### `ai_generate`

Panggil AI memakai API key admin.

Request:

```json
{
  "action": "ai_generate",
  "app_id": "nama-app",
  "prompt": "...",
  "systemPrompt": "... optional ...",
  "responseJson": false,
  "user_session": {
    "username": "laptopa",
    "sessionToken": "...",
    "deviceId": "uuid-device"
  }
}
```

Backend wajib:

1. Validasi `user_session`.
2. Ambil provider aktif berdasarkan `app_id`.
3. Panggil provider AI memakai API key admin di server.
4. Return hanya teks output.

Response:

```json
{
  "text": "hasil AI"
}
```

### `save_ai_config`

Dipakai oleh admin backend UI untuk menyimpan API key admin.

Request wajib membawa credential super admin:

```json
{
  "action": "save_ai_config",
  "app_id": "nama-app",
  "username": "admin",
  "password": "admin-password",
  "config": {
    "provider": "gemini",
    "provider_label": "Gemini",
    "base_url": "",
    "api_key": "API_KEY_ASLI",
    "model": "gemini-2.0-flash"
  }
}
```

## Frontend

### Konstanta Per Aplikasi

Setiap aplikasi harus punya `APP_ID` sendiri.

```js
const KNOWLEDGE_FUNCTION_URL = "https://yvcqgwpfjoxhuyhxuiry.supabase.co/functions/v1/knowledge-admin";
const APP_ID = "nama-app-baru";
const SUPABASE_ANON_KEY = "anon-key-supabase";
```

`APP_ID` harus stabil. Jangan berubah setelah user mulai memakai aplikasi, karena config admin dibaca berdasarkan `app_id`.

### Storage Lokal

Simpan pengaturan personal/admin di storage lokal aplikasi.

Chrome extension:

```js
chrome.storage.local.set({ ... })
```

Web app biasa:

```js
localStorage.setItem(...)
```

Key minimal:

```js
apiKeySource          // "admin" atau "personal"
apiKey                // personal only
model                 // personal only
provider              // personal only
customProviderLabel   // optional
customBaseUrl         // optional
adminAccessDeviceId
adminUserSession
```

### Device ID

Buat device ID sekali, simpan lokal.

```js
async function getOrCreateDeviceId() {
  const saved = await storageGet("adminAccessDeviceId");
  if (saved) return saved;
  const id = crypto.randomUUID();
  await storageSet("adminAccessDeviceId", id);
  return id;
}
```

### Wrapper Edge Function

```js
async function knowledgeApi(action, payload = {}) {
  const response = await fetch(KNOWLEDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ action, app_id: APP_ID, ...payload }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    if (response.status === 546) {
      throw new Error("Knowledge API 546: proses terlalu lama atau payload terlalu besar");
    }
    throw new Error(data.error || `Knowledge API ${response.status}`);
  }
  return data;
}
```

### Login User Admin

```js
async function loginAdminUser(username, password) {
  const deviceId = await getOrCreateDeviceId();
  const data = await knowledgeApi("login_user", {
    username,
    password,
    device_id: deviceId,
  });

  const session = {
    username: data.session.username,
    sessionToken: data.session.sessionToken,
    deviceId: data.session.deviceId,
    expiresAt: data.session.expiresAt,
  };

  await storageSet("adminUserSession", session);
  return session;
}
```

### Validasi Session

```js
async function validateStoredAdminUserSession() {
  const session = await storageGet("adminUserSession");
  if (!session?.username || !session?.sessionToken || !session?.deviceId) return null;

  try {
    const data = await knowledgeApi("validate_user_session", {
      username: session.username,
      session_token: session.sessionToken,
      device_id: session.deviceId,
    });

    const nextSession = {
      username: data.session?.username || session.username,
      sessionToken: session.sessionToken,
      deviceId: data.session?.deviceId || session.deviceId,
      expiresAt: data.session?.expiresAt || session.expiresAt || null,
    };

    await storageSet("adminUserSession", nextSession);
    return nextSession;
  } catch (_error) {
    await storageRemove("adminUserSession");
    return null;
  }
}
```

### Pemilihan API Key Efektif

```js
async function getEffectiveAiSettings() {
  const settings = await storageGetMany([
    "apiKeySource",
    "apiKey",
    "model",
    "provider",
    "customProviderLabel",
    "customBaseUrl",
  ]);

  const source = settings.apiKeySource || "admin";
  const hasPersonal = Boolean(settings.apiKey && settings.model && settings.provider);

  if (source === "personal" && hasPersonal) {
    return {
      source: "personal",
      apiKey: settings.apiKey,
      model: settings.model,
      provider: settings.provider,
      providerLabel: settings.customProviderLabel || "",
      baseUrl: settings.customBaseUrl || "",
    };
  }

  const config = await knowledgeApi("get_ai_config");
  if (!config.config?.hasApiKey) throw new Error("API key admin belum diset");

  const adminUserSession = await validateStoredAdminUserSession();
  if (!adminUserSession) {
    throw new Error("Sesi admin di perangkat ini sudah tidak aktif. Silakan login ulang.");
  }

  return {
    source: "admin",
    provider: config.config.provider,
    model: config.config.model,
    adminUserSession,
  };
}
```

### Pemanggilan AI

```js
async function callAi(prompt) {
  const ai = await getEffectiveAiSettings();

  if (ai.source === "admin") {
    const data = await knowledgeApi("ai_generate", {
      prompt,
      user_session: ai.adminUserSession,
    });
    return data.text || "";
  }

  return callProviderDirectly({
    provider: ai.provider,
    apiKey: ai.apiKey,
    model: ai.model,
    baseUrl: ai.baseUrl,
    prompt,
  });
}
```

## Provider Personal

Minimal dukung:

```text
gemini
sumopod
aimurah
custom OpenAI-compatible
```

Untuk personal mode:

- Gemini dipanggil langsung dari frontend ke Google Generative Language API.
- Sumopod/AIMurah/custom dipanggil ke endpoint OpenAI-compatible.
- Validasi personal optional, tetapi jika gagal jangan simpan API key baru.

## Admin UI Minimal

Admin UI perlu dua level akses:

1. **Super admin**
   - memakai `ADMIN_USERNAME` dan `ADMIN_PASSWORD` dari Edge Function secret.
   - boleh menyimpan/reset API key admin.
   - boleh membuat/reset user akses admin.

2. **Admin-user biasa**
   - username/password dari tabel `admin_ai_users`.
   - hanya boleh memakai API key admin untuk request AI.
   - tidak boleh melihat API key admin asli.

Field admin config minimal:

```text
Provider
Nama Provider custom
Endpoint URL custom
API Key Admin
Model Admin
Gemini fallback API key optional
Gemini fallback model optional
```

Setelah save admin config, kosongkan input API key di frontend. Backend mengembalikan `hasApiKey`, bukan API key asli.

## Checklist Integrasi App Baru

1. Tentukan `APP_ID`, contoh:

```js
const APP_ID = "nama-app-baru";
```

2. Tambahkan row awal di Supabase jika belum ada:

```sql
insert into public.admin_ai_config (id, app_id, provider, api_key, model)
values ('nama-app-baru', 'nama-app-baru', 'gemini', '', 'gemini-2.0-flash')
on conflict (id) do nothing;
```

3. Pastikan Edge Function `knowledge-admin` sudah deploy dan punya secret:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_USERNAME
ADMIN_PASSWORD
ADMIN_USER_PASSWORD_PEPPER
```

4. Di frontend, implementasikan:

```text
knowledgeApi()
getOrCreateDeviceId()
loginAdminUser()
validateStoredAdminUserSession()
getEffectiveAiSettings()
callAi()
```

5. UI Setting minimal:

```text
Sumber API key: admin / pribadi
Login akses admin: username, password
Personal provider, model, API key
Status API key aktif
```

6. Jangan pernah tampilkan API key admin dari backend.

7. Error session harus diarahkan ke login ulang:

```text
Sesi admin di perangkat ini sudah tidak aktif. Silakan login ulang.
```

## Perilaku yang Diharapkan

- Jika admin mengganti API key/model/provider untuk `app_id`, semua device yang memakai admin mode akan mengikuti konfigurasi baru pada request berikutnya.
- Jika user login di device baru dengan akun yang sama, device lama tidak valid lagi.
- Jika user memilih personal mode, aplikasi memakai API key lokal user dan tidak memakai Supabase admin AI.
- Jika API key admin kosong, admin mode harus gagal dengan pesan jelas.

## File Referensi di Repo Ini

Lampirkan file berikut ke agent yang akan meniru sistem ini:

```text
sidepanel.js
background.js
sidepanel.html
supabase/functions/knowledge-admin/index.ts
supabase_migration.sql
```

Bagian paling penting:

```text
sidepanel.js:
- knowledgeApi
- getOrCreateDeviceId
- validateStoredAdminUserSession
- getEffectiveAiSettings
- loginAdminAccess handler
- saveAdminApiKey handler

background.js:
- knowledgeApi
- validateStoredAdminUserSession
- getEffectiveAiSettings
- callAdminAiText

supabase/functions/knowledge-admin/index.ts:
- getAppId
- getAdminAiConfig
- saveAdminAiProvider
- loginAdminAiUser
- validateAdminAiUserSession
- callAdminAi

supabase_migration.sql:
- admin_ai_config
- admin_ai_providers
- admin_ai_users
```