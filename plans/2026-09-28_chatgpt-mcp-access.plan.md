---
slug: 2026-09-28_chatgpt-mcp-access
status: done
started: 2026-09-28
finished: 2026-09-28
issue:
---

# ChatGPT access to the Riverbanks MCP server

## Context

`/mcp` shipped under [accounts-cloud-mcp](2026-09-28_accounts-cloud-mcp.plan.md). It's
Streamable HTTP and OAuth 2.1. Supabase Auth's OAuth server is the authorization server, with
dynamic client registration (DCR) and ES256 tokens verified against the JWKS. It was built for
Claude Code and claude.ai connectors, and its OAuth flow passes locally end to end. The seapunk
team also uses ChatGPT, and should be able to make comics from there too.

What ChatGPT requires, per OpenAI's current docs ([auth](https://developers.openai.com/plugins/build/auth),
[MCP servers](https://developers.openai.com/api/docs/mcp)), checked on 2026-09-28, and where we
stand:

| ChatGPT requirement | Riverbanks today |
|---|---|
| OAuth 2.1 + PKCE `S256`; no API keys, bearer-only or machine-to-machine grants | ✅ Supabase advertises `S256` and `none` |
| Protected-resource metadata and a `401` `WWW-Authenticate: Bearer resource_metadata=…` | ✅ `/.well-known/oauth-protected-resource[/mcp]` |
| Authorization-server metadata; `issuer` equals `authorization_servers[0]` by exact string | ✅ `https://krugthurasfvthjtchqo.supabase.co/auth/v1` on both sides |
| Client registration: CIMD preferred, DCR accepted | ✅ DCR on; ❌ no CIMD (Supabase doesn't advertise `client_id_metadata_document_supported`), so ChatGPT falls back to DCR |
| Sends `resource=<our MCP URL>` on authorize and token requests; the auth server should put it in `aud`, and **the MCP server must verify audience** | ❓ unknown whether Supabase copies `resource` into `aud`; we check issuer, signature, expiry and role, **not `aud`** |
| Redirect URI allowlisted | ✅ DCR registers ChatGPT's redirect itself (the callback-ID form, since Supabase doesn't advertise `authorization_response_iss_parameter_supported`) |
| OIDC scopes requested by default if advertised (`openid email profile`) | ✅ advertised; `openid` needs asymmetric keys, and we have ES256 |
| Write actions need a manual confirmation in each conversation | ⚠️ none of our tools carry `readOnlyHint`, so reads may also prompt |
| Deep research and company knowledge need `search` + `fetch` tools with fixed schemas | ❌ not present (plain Developer-mode chat doesn't need them) |
| Optional: a profile tool with `_meta: {"openai/profile": true}` for multiple accounts; mTLS client certificate | ❌ neither (both optional) |

Access is through ChatGPT **Developer mode** (Settings → Security and login → Developer mode,
then add the server under Plugins/Apps). It's available on Plus, Pro, Business, Enterprise and Edu,
on the web app.

## Goal

A seapunk team member on a ChatGPT plan with Developer mode adds
`https://riverbanks-generator.vercel.app/mcp` as a custom connector, signs in on the Riverbanks
consent screen (which shows "ChatGPT wants to use your Riverbanks account"), and can list, create
and edit their comics from ChatGPT, with edits appearing live in the open editor. Reads don't ask
for confirmation; writes and deletes do. Deep research can find and cite comics by their text.
Tokens are checked for audience, as OpenAI's docs require, and the same server keeps working for
Claude.

## Approach

**Spike before code.** The unknowns are all on the wire: whether Supabase honours `resource`
(RFC 8707), what `aud`, `scope` and `client_id` its OAuth tokens carry, and whether ChatGPT's
current Developer mode speaks Streamable HTTP to us. (OpenAI's example page still shows SSE, while
connectors in practice accept Streamable HTTP.) One real connection answers all of them, so the
first task is connecting ChatGPT to production and logging token **claims only** (never the token)
for one session.

**Spike result (2026-09-28, production, Yan's ChatGPT Plus):** ChatGPT's plugin client
(`codex-mcp-client/0.147.0-alpha`) registered itself by DCR, completed consent, and worked over
**Streamable HTTP** (protocol `2025-06-18`; it POSTs with `Accept: text/event-stream,
application/json`). Before signing in it probed with 13 token-less GETs, each answered with the
`401` challenge. The OAuth token carries `iss` = the Supabase issuer, **`aud: "authenticated"`**
(Supabase ignores `resource`), `client_id` (the DCR client), `scope: "openid profile email phone
offline_access"`, and `role`, `session_id` and `amr`. Calls seen: `initialize`, `tools/list`,
`resources/list`, `resources/templates/list`, `tools/call` (`list_comics`). So the **fallback
rule** applies, no SSE endpoint is needed, and the debug flag is now off.

**Audience, depending on the spike:**

- If Supabase puts the resource in `aud`: verify that `aud` includes `https://<app>/mcp`, and
  reject anything else with the `401` challenge.
- If it doesn't (tokens arrive with `aud: "authenticated"`): keep accepting them, but require the
  OAuth-only `client_id` claim, which browser session tokens don't carry (both kinds carry
  `session_id`, so that one doesn't help). A web session token then can't be replayed at `/mcp`. Record the gap and raise it with Supabase.
  Standing up our own authorization server just for `aud` was rejected, because it would duplicate
  sign-in, consent and grant storage that Supabase already handles.

**Tool hints** (`annotations` in the MCP spec, which ChatGPT and Claude both read):

- `readOnlyHint: true` on `list_comics`, `get_comic`, the page resource, and the new `search` and
  `fetch`
- `destructiveHint: true` on `delete_comic`, `delete_page`, `delete_balloon` and
  `remove_panel_image`
- `idempotentHint` where it's true (`rename_comic`, `set_grid`, `update_*`)
- `openWorldHint: true` on `set_panel_image`, which fetches external URLs

Titles already exist; they become the confirmation text ChatGPT shows.

**Deep research: `search` and `fetch`**, in OpenAI's schemas, over the user's own comics (under
RLS):

- `search(query)` matches titles and balloon text, and returns `{results: [{id, title, url}]}`
  both as `structuredContent` and as a JSON string in `content`
- `fetch(id)` returns `{id, title, text, url, metadata}`, where `text` is a plain-text script of
  the comic: page by page, panels in reading order, each balloon as "type: text"
- the `url` is the editor link with `?page=`, so answers cite the actual page

Search runs in Postgres over the JSONB. It's a simple `ilike` on the title plus a
balloon-text match, which is enough for a team's worth of comics. Full-text indexes can come
later if it's slow.

**Profile tool** (small, for multiple accounts): `whoami`, marked with
`_meta: {"openai/profile": true}`, returns the stable user id and email.

**Out of the critical path:** CIMD (Supabase can't advertise it yet), mTLS (optional, since
ChatGPT only presents a certificate), and the ChatGPT Apps SDK UI components (widgets). Tools
alone are enough for a comic editor whose real UI is the web app.

## Tasks

- [x] Spike: log token claims (not tokens) at `/mcp` behind an env flag; connect ChatGPT Developer mode to production; record the transport, the DCR request, `aud`/`scope`/`client_id`, and whether consent and tool calls work; turn the flag off
- [x] Audience check per the spike (verify `aud` includes the MCP resource, or require the OAuth-only `client_id` claim), with tests
- [x] Tool annotations on all 18 tools + the resource, with tests
- [x] `search` + `fetch` tools in OpenAI's schemas, with `describeComic`-based plain-text rendering, with tests
- [x] `whoami` profile tool with `_meta["openai/profile"]`
- [x] E2E: extend `e2e/oauth.e2e.ts` to send `resource` and assert the audience rule end to end against local Supabase
- [x] Docs: a README "Using it with ChatGPT" section, plus a short addendum for the team email
- [x] Production verification (below), then deploy — see Outcome for what passed and what was skipped

## Test list (TDD)

- [x] `verifyAccessToken` accepts a token whose `aud` includes the MCP resource and rejects one for another resource (or, on the fallback rule, rejects a token without `client_id`) — unit — `src/lib/server/mcp/auth.test.ts`
- [x] The rejection is a `401` carrying the `resource_metadata` challenge with `error="invalid_token"` — unit — `src/routes/mcp/mcp.test.ts`
- [x] Every tool has an annotation set; reads are `readOnlyHint`, deletes are `destructiveHint`, `set_panel_image` is `openWorldHint` — unit (in-memory SDK client, `listTools`) — `src/lib/server/mcp/server.test.ts`
- [x] `search` finds by title and by balloon text, is case-insensitive, returns `{results:[{id,title,url}]}` in both `structuredContent` and the text content, and empty results are `[]`, not an error — unit — `server.test.ts`
- [x] `fetch` returns the script text with pages in order, panels in reading order and balloons as “type: text”, a `url` with `?page=1`, and not-found as a tool error — unit — `src/lib/ops/script.test.ts`, `server.test.ts`
- [x] `whoami` returns the verified user's id and carries `_meta["openai/profile"] === true` — unit — `server.test.ts`
- [x] `search` only ever sees the caller's comics (RLS) — integration — `src/lib/persistence/supabase-store.int.test.ts`
- [x] The OAuth flow with `resource` yields a token that `/mcp` accepts, and a token minted without `resource` follows the chosen rule — e2e — `e2e/oauth.e2e.ts`

## Verification

In ChatGPT (web), on an account with Developer mode:

1. Settings → Security and login → turn on **Developer mode**. Then Plugins (or Apps & Connectors)
   → **+** → name "Riverbanks", URL `https://riverbanks-generator.vercel.app/mcp`, auth **OAuth**.
2. ChatGPT opens the Riverbanks consent page. It reads "ChatGPT wants to use your Riverbanks
   account". Signing in first if needed, then **Allow**, returns to ChatGPT with the connector
   connected.
3. In a chat with the connector enabled, ask it to list my comics: it answers **without** a
   confirmation prompt.
4. Ask it to create a comic called ChatGPT test with a speech balloon saying HELLO FROM GPT.
   ChatGPT asks to confirm the write; after confirming, the comic appears in `/comics`. With the
   comic open in the editor, a second edit shows up live.
5. Ask it to delete that comic: the confirmation is marked destructive.
6. In deep research, ask what the Riverbanks comics say about Hilsa. The answer cites a comic
   page link that opens the editor on the right page.
7. Revoke by disconnecting in ChatGPT. The next call fails with a `401` and ChatGPT asks to
   reconnect.
8. Regression: Claude Code `/mcp` still connects and the existing e2e suite passes.

## Out of scope

- The OpenAI API's hosted MCP tool (Responses API `mcp` tool with a bearer token), for scripted
  GPT use. It needs no OAuth flow, just a token and a server URL, and could follow cheaply if
  wanted
- ChatGPT Apps SDK widgets (in-chat comic previews), and publishing to the ChatGPT app directory
- CIMD, until Supabase supports it; mTLS client-certificate checks
- Server-side PNG rendering for previews (still out, as in the MCP plan)

## Open questions

- [x] **Who has Developer mode?** Yan tests with a ChatGPT **Plus** account (2026-09-28); Developer mode is available on Plus.
- [x] **ChatGPT or the API?** ChatGPT only: the users aren't API users. The API stays out of scope.
- [x] **Audience fallback.** Accepted: if Supabase ignores `resource`, require the OAuth-only
      `client_id` claim instead of an `aud` check.
- [x] Does ChatGPT connect over Streamable HTTP? **Yes** (spike): no SSE endpoint needed.

## Outcome

Done on 2026-09-28. Verified on production in Yan's ChatGPT Plus (web, Developer mode):

- ✅ **Steps 1–2:** the connector was created (ChatGPT shows it as a plugin), and OAuth dynamic
  registration plus the Riverbanks consent screen completed.
- ✅ **Step 3:** "list my comics" returned all four comics, with **no confirmation** prompt.
- ⚠️ **Step 4:** "create a comic … HELLO FROM GPT" worked (comic created, with a working "Open it
  in Riverbanks" link), but ChatGPT **did not ask to confirm**, although the tool is annotated as
  a write. OpenAI's docs say writes need confirmation; in practice ChatGPT's plugin mode only
  prompted for the destructive tool. Possible causes: an earlier "always allow", or a policy that
  confirms destructive actions only. Our annotations are as intended; this is ChatGPT's behaviour.
- ✅ **Step 5:** "delete the ChatGPT test comic" **asked for confirmation** (`destructiveHint`).
- ⏭️ **Step 6:** deep research with `search`/`fetch`, skipped by Yan. The tools are unit-tested
  against OpenAI's schemas but haven't been exercised by ChatGPT deep research.
- ⏭️ **Step 7:** disconnect → 401 → reconnect, not run.
- ✅ **Step 8:** Claude Code still connects to production after the `client_id` rule.

**What changed in the design.**

- Supabase ignores RFC 8707 `resource`, so tokens carry `aud: "authenticated"` and there's no
  audience check. `/mcp` requires the OAuth-only `client_id` claim instead (the accepted
  fallback), which also shuts out replayed web-session tokens.
- ChatGPT's plugin client is Codex's MCP client (`codex-mcp-client`), speaks Streamable HTTP,
  and needed no SSE endpoint.
- The spike also exposed and fixed a live-update race: edits landing before the editor joined
  Realtime were missed, and the editor now catches up when its subscription connects.

**Follow-ups, if wanted:** run deep research once to confirm `search`/`fetch` citations. Ask
Supabase about RFC 8707 support, so a real audience check can replace the `client_id` rule.
