# Retell AI

Last verified: 2026-10-20 (partial: written from targeted pages before the platform-research skill existed; a full run is pending)

Voice AI agent platform: telephony, speech-to-text, LLM and text-to-speech in one. This is our default voice platform.

## Access

- **Key:** `RETELL_API_KEY` in `.env`. A key is per workspace and created on the dashboard's API Keys tab.
- **MCP server (preferred):** hosted at `https://mcp.retellai.com` and connected in `.mcp.json` as `retell`. Auth is a Bearer token, injected by `scripts/mcp-headers.mjs RETELL_API_KEY`.
  - It exposes three meta-tools, used in this order: `list_api_endpoints` (optional `search`), then `get_api_endpoint_schema`, then `invoke_api_endpoint`.
  - It rejects arguments that aren't in the endpoint schema before calling the API. Deprecated endpoints aren't exposed.
  - Endpoint names are camelCase operation IDs (`listAgents`, `createRetellLLM`, `publishAgentVersion`, `importPhoneNumber`). The `search` filter matches substrings, so search for `agent` rather than `list agents`.
  - MCP `listAgents` is `POST /v2/list-agents` (paginated). REST `GET /list-agents` was deprecated on 2026-07-31; use `POST /v2/list-agents`, which returns `{ items, has_more, pagination_key }`.
  - Verified working in Claude Code on 2026-10-20.
  - The legacy server `retell.stlmcp.com` was removed on 2026-07-20, so don't use it.
  - A local alternative, `npx @retell-ai/mcp-server`, also exists.
- **REST fallback:** base URL `https://api.retellai.com`, with header `Authorization: Bearer $RETELL_API_KEY`.
  - Most endpoints have no version prefix (`/create-agent`, `/get-agent/{id}`). Calls are under `/v2/` (`POST /v2/list-calls`, `/v2/create-phone-call`, `/v2/create-web-call`).
  - Full endpoint index: https://docs.retellai.com/llms.txt (append `.md` to any docs page for raw markdown).
- **SDKs:** `retell-sdk` on npm and on PyPI.

## Build model

A receptionist is built from two objects:

1. **Retell LLM**, created with `POST /create-retell-llm`. It holds the brain: prompt, tools and knowledge base.
2. **Agent**, created with `POST /create-agent`. It holds the voice and call behaviour, and points at the LLM:
   `response_engine: { type: "retell-llm", llm_id }`.

Other response engines are `conversation-flow` (a node graph) and `custom-llm` (our own websocket). The default choice is `retell-llm` with a **single prompt**. When the call has clearly separate phases, use `conversation-flow` instead.

### Retell LLM essentials
- **`model`:** defaults to `gpt-5.6-terra`. Other options include `claude-5.5-sonnet`, `gpt-6.1-sol`, `gemini-3.6-flash` and many more; read the full list from the schema. Set `s2s_model` *or* `model`, never both.
- **`model_temperature`:** default 0. Keep it low for reliable tool calls.
- **`start_speaker`:** `"agent"` for inbound receptionists, together with a `begin_message` greeting.
  - `begin_message: ""` makes the agent wait for the caller.
  - Leaving `begin_message` unset makes the LLM generate the greeting.
- **`general_prompt` and `general_tools`:** apply in every state.
- **`states`: don't use them.** A Retell LLM with `states` is a "multi-prompt" agent, which is being retired.
  - From 2026-12-15 the API rejects creating them.
  - From 2027-02-01 existing ones can't be edited, and are later auto-converted to conversation flow.
  - Use a single prompt, or `conversation-flow` (subagent nodes) instead.
  - Source: https://docs.retellai.com/deprecation-notice/2026/12-15_multi_prompt_agents
- **`default_dynamic_variables`:** `{{var}}` fallbacks used in prompts and tools, such as business name and hours.
- **Knowledge base:** `knowledge_base_ids`, tuned with `kb_config.top_k` (1–10) and `kb_config.filter_score` (0–1).

### Tool types (`general_tools` / state `tools`)
- `end_call`
- `transfer_call`
  - Destination: `predefined` (an E.164 number or a `{{var}}`) or `inferred`.
  - Option:
    - `cold_transfer`: `sip_invite` by default, or `sip_refer`.
    - `warm_transfer`: supports hold music and whisper/handoff messages.
    - `agentic_warm_transfer`: a second agent briefs the human before connecting the caller.
- `send_sms`: predefined, inferred or template text. Retell SMS needs the $20/month add-on.
- `custom`: an HTTP call to our endpoint. Fields: `url`, `method`, `parameters` (JSON Schema), `response_variables`, `timeout_ms` (default 120 s, so lower it), and `max_retry` (only for idempotent endpoints).
- `code`: inline JavaScript of up to 20k characters, with a timeout of 5–60 s.
- `extract_dynamic_variable`, `press_digit`, `agent_swap`, `mcp`, `integration_app`.
- Tool names must be unique, use only `[A-Za-z0-9_-]`, and be at most 64 characters.

### Integrations (booking and CRM)
- Built-in integrations: Cal.com, HubSpot, Salesforce, GoHighLevel and Zendesk.
- **The provider must be connected once on the dashboard's Integrations page** before any agent can use it. That can't be done by API. If a client needs booking and isn't connected, list it under "Couldn't do".
- The old `check_availability_cal` / `book_appointment_cal` tool types aren't in the current spec. Use `integration_app`, or a `custom` tool pointed at our own booking endpoint.
- Test calls hit the real provider and create real bookings or records.

### Agent essentials
- **Required:** `response_engine` and `voice_id`.
  - Default voice: `retell-Cimo`.
  - Browse voices with `GET /list-voices`.
- **Locale:** `language` (default `en-US`) and `timezone` (IANA; the default is LA, so always set it).
- **Call behaviour:**
  - `interruption_sensitivity` and `responsiveness`, both 0–1 with default 1.
  - `enable_backchannel`.
  - `ambient_sound`: leave it off for receptionists.
- **Call limits:**
  - `end_call_after_silence_ms`: default 10 min, so set about 30 s.
  - `max_call_duration_ms`: default 1 h, so set about 15–20 min.
- **Voicemail:** `voicemail_option` matters for outbound only.
- **Transcription:** `boosted_keywords` (business name, staff names, services) and `pronunciation_dictionary` (IPA).
- **After the call:** `post_call_analysis_data` holds custom fields to extract, such as caller name, reason and callback number.
- **Data and privacy:**
  - `pii_config` and `data_storage_setting`: use `everything_except_pii` for medical or legal clients.
- **Webhooks:** `webhook_url` and `webhook_events` per agent.

### Versioning
- Agents are versioned. `POST /publish-agent-version/{agent_id}` with `{ version }` publishes a draft.
- Phone numbers bind through `inbound_agents: [{ agent_id, weight: 1, agent_version }]`.
  - `agent_version` can be a number, `"latest"` or `"latest_published"`.
  - Use `"latest_published"` for production numbers so draft edits don't go live.

## Phone numbers
- **Buy:** `POST /create-phone-number`.
  - `area_code` takes US area codes only. `country_code` is `US` or `CA`. `number_provider` is `twilio` (default) or `telnyx`. `toll_free` is optional.
  - Fields `inbound_agents` and `outbound_agents` are weighted arrays whose weights must sum to 1. There are no single `inbound_agent_id` fields.
- **Bring your own number:** `POST /import-phone-number` imports a number over SIP trunking. Retell charges nothing for telephony in that case.
  - Use this for countries outside US/CA, where the client's carrier forwards or trunks the calls to Retell.
- **Other fields:**
  - `fallback_number`: used when concurrency is full.
  - `inbound_webhook_url`: can override the agent or variables per call, or reject the call.
  - `allowed_inbound_country_list`: restricts which countries can call in.

## Webhooks
- **Events:** `call_started`, `call_ended`, `call_analyzed` (the default three), plus `transcript_updated` and the `transfer_*` events.
- **Payload:** `{ event, call }`. `call_analysis` arrives only on `call_analyzed`.
- **Our endpoint's responsibilities:**
  - Return 2xx within 10 s. Retell retries up to 3 times, so the handler must be idempotent.
  - Verify the `x-retell-signature` header against the API key with `Retell.verify(rawBody, apiKey, sig)`, on the raw body.
- **Retell's source IP:** `100.20.5.228`.

## Testing
- `POST /v2/create-web-call` with `agent_id` gives a browser test call without spending a phone number.
- Read results back with `GET /v2/get-call/{call_id}`, which returns the transcript, recording, analysis and latency.
- The dashboard also has simulated test cases and QA (the MCP tools cover test cases too).

## Pricing (pay as you go, checked 2026-10-19)
- **Total cost:** typically $0.07–$0.31 per minute. New accounts get $10 in free credit. Billing is per second.
- **Per-minute parts:**
  - Voice infrastructure: $0.055.
  - Telephony: $0.015 (US, on a Retell number). SIP trunking is free.
  - TTS: $0.015 for Retell/Cartesia/Minimax/OpenAI voices, $0.04–$0.10 for ElevenLabs.
  - LLM: gpt-5.6-terra $0.064, claude-5.5-sonnet $0.064, gpt-5.4-mini $0.024, gemini-3.6-flash $0.024, claude-5.5-haiku $0.0032.
  - Add-ons: knowledge base +$0.005, PII removal +$0.01, denoising +$0.005.
- **Monthly:**
  - Phone number: $2.
  - Knowledge bases: first 10 free, then $8 each.
  - Concurrency: 20 calls free, then $8 per extra call slot.
- **What gets billed:** the AI fee stops after a transfer but telephony continues. Hold and silence time are billed. Failed calls aren't billed.

**Receptionist default stack:** `gpt-5.6-terra` with a Retell voice at $0.015 TTS, which comes to about **$0.15 per minute** all-in on a Retell number.

## Verified 2026-10-20 (while writing the build skills)
- **Integrations connect by API.**
  - `create-app` (type `calendar`, `crm`, `knowledge_base`, `support` or `communication`; `provider` from `list-app-templates`) stores the client's credentials.
  - Providers that use an API key, like Cal.com, connect fully by API. OAuth providers need `connect-app`, which is a click by the owner.
  - `test-app-auth` checks the connection. `get-app-tool-schema` gives the tool fields.
  - Up to 20 apps per provider.
- **Cal.com tools:** Check Availability, Book Appointment, List Bookings (by attendee email), Get, Reschedule and Cancel. There's one Check Availability + Book Appointment pair per event type (a link ID or numeric ID). Every call reads and writes Cal.com live.
  - Native calendar integrations: Cal.com and Calendly.
  - Native CRMs: HubSpot, GoHighLevel, Salesforce, Zoho, Dynamics and Zendesk.
- **Code tool** (`type: code`):
  - Runs JavaScript in a QuickJS sandbox, with `fetch` and top-level `await`. There's no `require`, `import` or `Intl`.
  - Timeout is 5–60 s.
  - It reads `dv.*` (including system variables like `dv.current_time` and `dv.user_number`) and `metadata.*`. It takes **no LLM-supplied parameters**.
  - Dynamic variables are stored in plaintext, so **never put secrets in it**.
  - Requests come from IP `35.166.138.221`.
- **System variables:**
  - Time: `{{current_time}}`, `{{current_hour}}` (a fraction) and `{{current_calendar}}` (14 days), all in the agent's timezone, plus `_<Area/City>` variants for other zones.
  - Call: `{{user_number}}`, `{{agent_number}}`, `{{direction}}`, `{{call_id}}`.
- **Custom function security:** requests carry `X-Retell-Signature` (an HMAC-SHA256 of the raw body, checked with the API key; empty string for GET and DELETE).
- **Testing by API:**
  - `create-test-case-definition`, then `create-batch-test`, then `get-batch-test` (poll until `complete`), then `list-test-runs` and `get-test-run`.
  - `agentPlaygroundCompletion` is a stateless text turn (useful for timing models).
  - Tests bill at production chat rates, about $0.001–$0.05 per message, plus 1 grading unit per batch case. Voice tests bill per minute.
- **Model speed:**
  - Model choice comes from the `model` enum on `createRetellLLM`. There's no public table of latency per model.
  - "Fast tier" (`model_high_priority`) costs 1.5×.
  - `model_ultrafast` works only on `gpt-6.1-sol`.
  - The latency target is e2e p50 under 2.5 s. Retell can reach about 600 ms.
  - The default model `gpt-5.6-terra` is *not* the newest, so never rely on the default.
- **SMS from the agent's own number** needs US A2P approval:
  - $4–45 brand fee plus a $15 campaign fee, about 2–3 weeks.
  - Then $20/month plus $0.01 per SMS.
  - US only, not toll-free, and not on Telnyx.
  - The SMS-approved Retell pool skips A2P but sends a fixed template only.
- **Knowledge base:** sources are URLs (max 500, auto-refreshed or crawled every 24 h), files, text, Google Drive, OneDrive and Notion. Retrieval adds under 100 ms.

## Learned on the Kedali build (2026-10-20)
- **Pre-call tools work through the API.**
  - Agent field `pre_session_tools` (code, custom or app tools, plus `depends_on`) runs before the first word. Its `response_variables` become dynamic variables.
  - The docs page `agent/agent-workflow` still says "dashboard only (Aug 2026)", but the spec and API accept it. Verified on create and update.
  - `post_session_tools` (with conditions, and SMS) exists too.
  - **Use a pre-call code tool for open/closed, not an in-call tool:** Claude Haiku skipped an in-call `check_open` and guessed from `{{current_time}}`.
- **Knowledge base creation is multipart.** The MCP `invoke_api_endpoint` can't send it ("requestBody expected string"). Use REST with curl, and pass `-F 'knowledge_base_urls=["url1","url2"]'` as a JSON string. It went from `in_progress` to `complete` in under a minute for 7 URLs.
- **Simulation tests:**
  - Test case definitions take `user_prompt`, `metrics` (success criteria as plain sentences), `dynamic_variables`, `tool_mocks` and `llm_model` (the simulated user's model).
  - Agent-level pre-call tools don't run in simulations, which use the `response_engine` only, so set their output variables in `dynamic_variables`.
  - Simulated users keep pushing until Retell aborts with "Ending the conversation early as there might be a loop" (status `error`). Tell the sim user to wrap up once answered. Runner: `scripts/sim-tests.mjs`.
  - Results vary run to run: a case can pass in one round and fail the next. Judge by must-pass rate over several rounds.
- **Model bench:** `scripts/model-bench.mjs` times candidate models on the client's real prompt through `agentPlaygroundCompletion` with tool mocks. It cleans up its `zz-modeltest-*` agents and LLMs.
- **Publishing:** `publish-agent-version` with `{version, version_title, version_description}` returns 200 with an empty body. Check with `list-agent-versions`.

## Real call cost (first measured call, Kedali web test, 2026-10-20)
- **`call_cost` from get-call is in cents.** `unit_price` is cents per second.
- **The call:** 8 min 18 s cost 68.1¢, about **$0.082/min** for a web call. Breakdown:
  - voice engine 45.7¢
  - Retell TTS 12.5¢
  - claude-5.5-haiku 2.7¢
  - KB 4.1¢
  - "llm_token_surcharge" 1.1¢ (long prompt)
  - post-call analysis on gpt-5.6-terra 2.1¢
- **A phone call adds telephony** at about $0.015/min, so ≈ **$0.10/min**.
- **Latency:** e2e p50 was 1735 ms, under the 2.5 s target.

## Gotchas
- The default `timezone` is America/Los_Angeles, so always set it from the client's location.
- `custom` tool timeout defaults to 120 s. Callers hang up long before that, so set 8–10 s.
- Buying numbers is US/CA only. Other countries need SIP import.
- Integrations need a one-time dashboard connection and can't be set up by API.
- Never build multi-prompt (`states`) agents: they're retired from 2026-12-15.
- Changes to a live agent go into a draft version. Publish them and bind numbers to `latest_published`.

## Account state (2026-10-19)
- 1 existing agent: "Retiro Del Rocio Concierge" (retell-llm, gpt-5.6-terra, voice retell-Cimo, unpublished, timezone Africa/Lagos, 2 calls). It isn't ours, so leave it alone unless told otherwise.
- No phone numbers and no knowledge bases yet.
