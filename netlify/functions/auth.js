// netlify/functions/auth.js
import fetch from "node-fetch";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// ONLY your main site should be allowed to receive the token
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

export async function handler(event) {
  try {
    const url = new URL(event.rawUrl);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") || ""; // optional

    // Step A: first visit — redirect user to GitHub OAuth
    if (!code) {
      const redirect = new URL("https://github.com/login/oauth/authorize");
      redirect.searchParams.set("client_id", GITHUB_CLIENT_ID);
      // Request repo scope so CMS can commit to your repo
      redirect.searchParams.set("scope", "repo");
      if (state) redirect.searchParams.set("state", state);

      return {
        statusCode: 302,
        headers: {
          Location: redirect.toString(),
          "Cache-Control": "no-store",
        },
      };
    }

    // Step B: callback — exchange code for token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      return html(`OAuth error: ${escapeHtml(JSON.stringify(tokenJson))}`);
    }

    // Success page that posts the token back to opener (the /admin page)
    const token = tokenJson.access_token;

    return html(`
<!doctype html>
<meta charset="utf-8" />
<title>OAuth Complete</title>
<script>
  (function () {
    function sendTo(openerOrigin) {
      try {
        window.opener.postMessage(
          'authorization:github:success:' + ${JSON.stringify(token)},
          openerOrigin
        );
      } catch (e) {}
    }

    // Try explicit allow-list first (set via env var)
    var allowed = ${JSON.stringify(ALLOWED_ORIGINS)};
    if (allowed.length) {
      allowed.forEach(sendTo);
    } else {
      // Fallback: try the opener's origin if available
      try {
        var origin = new URL(document.referrer).origin;
        if (origin) sendTo(origin);
      } catch (e) {}
    }

    // Close popup shortly after
    setTimeout(function () { window.close(); }, 100);
  })();
</script>
<p>Login complete — you can close this window.</p>
    `);
  } catch (err) {
    return html("Unexpected error: " + escapeHtml(String(err)));
  }
}

function html(body) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // Helpful if you run into CORS issues during local tests
      "Access-Control-Allow-Origin": "*",
    },
    body,
  };
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
}
