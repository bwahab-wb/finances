/* ==========================================================================
   onedrive.js — synchronisation du classeur depuis OneDrive.

   Connexion OAuth 2.0 « code + PKCE » directement depuis le navigateur : pas
   de serveur, pas de secret. Le classeur est lu en lecture seule (Files.Read)
   via Microsoft Graph, puis passe par le même chemin que l'import manuel.
   Les jetons restent en IndexedDB, sur l'appareil.
   ========================================================================== */

const OneDrive = (() => {
  "use strict";

  const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
  const GRAPH = "https://graph.microsoft.com/v1.0";
  const SCOPE = "Files.Read offline_access";
  const KEY = "onedrive";
  const PENDING = "onedrive-pending";

  let cfg = { clientId: "", path: "", token: null, lastSync: null };

  async function init() {
    try {
      const saved = await Data.load(KEY);
      if (saved) cfg = { ...cfg, ...saved };
    } catch {}
    return cfg;
  }

  const get = () => cfg;
  const connected = () => !!(cfg.clientId && cfg.token && cfg.token.refresh);
  const ready = () => connected() && !!cfg.path;

  async function update(patch) {
    cfg = { ...cfg, ...patch };
    await Data.save(KEY, cfg);
  }

  async function disconnect() {
    cfg = { ...cfg, token: null, lastSync: null };
    await Data.save(KEY, cfg);
  }

  /** L'URI de redirection doit être déclarée à l'identique chez Microsoft. */
  const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, "");

  const b64url = (bytes) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const random = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

  /* ---------- Connexion ---------- */

  async function login() {
    if (!cfg.clientId) throw new Error("Renseigne d'abord l'identifiant d'application (client ID).");
    const verifier = random(48);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const state = random(16);
    sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state }));
    const p = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: "code",
      redirect_uri: redirectUri(),
      response_mode: "query",
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    location.assign(`${AUTH}/authorize?${p}`);
  }

  /** À appeler au démarrage : termine la connexion si on revient de Microsoft.
      Renvoie true si une connexion vient d'aboutir. */
  async function handleRedirect() {
    const q = new URLSearchParams(location.search);
    if (!q.has("code") && !q.has("error")) return false;
    const clean = () => history.replaceState(null, "", redirectUri());
    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING) || "null");
    } catch {}
    sessionStorage.removeItem(PENDING);
    if (!pending || q.get("state") !== pending.state) {
      // Un « code » qui ne vient pas de nous : on ne touche à rien.
      return false;
    }
    clean();
    if (q.has("error")) throw new Error(q.get("error_description") || q.get("error"));
    await tokenRequest({
      grant_type: "authorization_code",
      code: q.get("code"),
      redirect_uri: redirectUri(),
      code_verifier: pending.verifier,
    });
    return true;
  }

  async function tokenRequest(params) {
    const res = await fetch(`${AUTH}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: cfg.clientId, scope: SCOPE, ...params }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
      throw new Error(json.error_description || `Microsoft a refusé la connexion (${res.status}).`);
    }
    await update({
      token: {
        access: json.access_token,
        refresh: json.refresh_token || (cfg.token && cfg.token.refresh) || null,
        expires: Date.now() + (json.expires_in || 3600) * 1000,
      },
    });
  }

  async function accessToken() {
    if (!connected()) throw new Error("OneDrive n'est pas connecté.");
    if (cfg.token.access && cfg.token.expires - 60000 > Date.now()) return cfg.token.access;
    try {
      await tokenRequest({ grant_type: "refresh_token", refresh_token: cfg.token.refresh });
    } catch (err) {
      // Le jeton de renouvellement d'une application web expire au bout de 24 h.
      await disconnect();
      throw new Error("La session OneDrive a expiré : reconnecte-toi. (" + err.message + ")");
    }
    return cfg.token.access;
  }

  /* ---------- Lecture du classeur ---------- */

  async function fetchWorkbook() {
    const path = cfg.path
      .trim()
      .replace(/^\/+/, "")
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    if (!path) throw new Error("Indique le chemin du classeur dans OneDrive.");
    const token = await accessToken();
    const meta = await fetch(`${GRAPH}/me/drive/root:/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (meta.status === 404) throw new Error(`Fichier introuvable dans OneDrive : « ${cfg.path} ».`);
    if (!meta.ok) throw new Error(`OneDrive a répondu ${meta.status}.`);
    const item = await meta.json();
    const url = item["@microsoft.graph.downloadUrl"];
    if (!url) throw new Error("Ce chemin ne désigne pas un fichier.");
    // L'adresse de téléchargement est pré-signée : elle ne doit pas recevoir l'en-tête Authorization.
    const file = await fetch(url);
    if (!file.ok) throw new Error(`Téléchargement impossible (${file.status}).`);
    await update({ lastSync: Date.now() });
    return { buffer: new Uint8Array(await file.arrayBuffer()), name: item.name, modified: item.lastModifiedDateTime };
  }

  return { init, get, update, connected, ready, login, handleRedirect, disconnect, fetchWorkbook, redirectUri };
})();
