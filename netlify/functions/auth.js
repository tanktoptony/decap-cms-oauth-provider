// netlify/functions/auth.js
export async function handler(event) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true,
      hint: "Function is reachable. Next step: wire GitHub OAuth for Decap CMS.",
      path: event.path
    }),
  };
}
