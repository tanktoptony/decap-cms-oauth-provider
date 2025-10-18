// netlify/functions/auth.js
// Minimal GitHub OAuth provider compatible with Decap CMS "github" backend.
// Env vars required on this OAuth site (Netlify > Site settings > Environment):
//   GITHUB_CLIENT_ID
//   GITHUB_CLIENT_SECRET
//
// Decap will open /auth (this function) in a popup, which should:
//   1) Redirect to GitHub authorize
//   2) Receive ?code in /callback (same function, we route both here via netlify.toml)
//   3) Exchange code for token
//   4) postMessage the token back to the opener and close the popup

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

const siteOrigin = process.env.SITE_ORIGIN || ""; // optional: restrict postMessage targetOrigin

export async function handler(event) {
  try {
    const url = new URL(event.rawUrl);
    const pathname = url.pathname || "";

    // Determine our base (this Netlify site) to compute redirect_uri
    const thisOrigin = `${url.protocol}//${url.host}`;
    const redirectUri = `${thisOrigin}/callback`;

    // Step 1: redirect to GitHub
    if (!url.searchParams.get("code")) {
      const state = Math.random().toString(36).slice(2);
      const scope = "repo,user"; // typical for GitHub content access
      const authorize = new URL("https://github.com/login/oauth/authorize");
      authorize.searchParams.set("client_id", CLIENT_ID);
      authorize.searchParams.set("redirect_uri", redirectUri);
      authorize.searchParams.set("scope", scope);
      authorize.searchParams.set("state", state);
      return {
        statusCode: 302,
        headers: { Location: authorize.toString() },
      };
    }

    // Step 2: exchange code for access_token
    const code = url.searchParams.get("code");

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      return json(400, {
        error: "token_exchange_failed",
        details: tokenJson,
      });
    }

    // Step 3+4: Send token to the opener (Decap CMS) and close popup
    // Decap listens for "authorization:github:success:<token>"
    const token = tokenJson.access_token;

    const targetOrigin = siteOrigin || "*"; // optionally restrict if you set SITE_ORIGIN
    const html = `<!doctype html>
<html><head><meta charset="utf-8" /></head>
<body>
<script>
  (function() {
    var payload = 'authorization:github:success:${token}';
    try {
      window.opener.postMessage(payload, '${targetOrigin}');
    } catch (e) {}
    window.close();
  })();
</script>
<p>Authenticated. You can close this window.</p>
</body></html>`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: html,
    };
  } catch (e) {
    return json(500, { error: "server_error", message: e.message });
  }
}

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}
