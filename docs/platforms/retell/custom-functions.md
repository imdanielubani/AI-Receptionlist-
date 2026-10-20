# Retell: custom functions

Last verified: 2026-10-20

These are gaps that need our own endpoint. Each one is built once and reused across clients. The full `platform-research` run will add any others it finds.

## notify-owner

**Need.** Get messages, ride or booking requests, and urgent problems to the business owner fast.
- Retell extracts fields after the call (`post_call_analysis_data`) and can POST them to a webhook, but it has no built-in per-call email or text to the owner.
- Retell's `send_sms` needs A2P approval on the agent's number (US, ~2–3 weeks), or it sends a fixed template only from the SMS-approved pool. Neither gives a free-form owner alert.
- Native CRM sync covers owners who use HubSpot, GHL, Salesforce, Zoho, Dynamics or Zendesk. This function is for everyone else.

**Where.** `functions/notify-owner/`, deployed per client as Cloudflare Worker `<slug>-notify-owner`.

**Routes**
1. **`POST /webhook`** (post-call): the agent's `webhook_url`, events `call_analyzed`.
   - Verify `X-Retell-Signature`.
   - Dedupe on `call.call_id`.
   - Return 204 straight away, then send in `ctx.waitUntil`.
   - Send only if `custom_analysis_data` shows something actionable (`message_taken`, `trip_request`, `booking_change`, `urgent`, `unanswered_question`).
   - **Email:** subject `[<Client>] <Ride request | Message | URGENT …> from <caller_name>`. The body has the key fields and a link to the call in the Retell dashboard.
   - **Text:** only when `urgent` is true.
2. **`POST /alert`** (mid-call custom tool `alert_owner`):
   - Inputs: `summary` (string), `callback_number` (string), `urgency` (enum: urgent, routine).
   - Verify the signature, send a text plus an email immediately, and return within 2.5 s: `{ "ok": true, "say": "I've alerted the team." }`
   - On failure: `{ "ok": false, "say": "I couldn't reach the team just now, but your details are saved and they'll see them right away." }` The post-call webhook also fires as a backup.

**Retell wiring for `alert_owner`**
- `type: custom`, `method: POST`, `url: https://<slug>-notify-owner.<account>.workers.dev/alert`
- `parameters`: JSON Schema with the inputs above.
- `timeout_ms: 8000`, `max_retry: 0`.
- `speak_during_execution: true` ("One moment while I alert the team").
- `response_variables`: `{ "alert_say": "$.say" }`

**Config (env and secrets per client)**
- `RETELL_API_KEY` (signature check)
- `OWNER_EMAILS`, `OWNER_SMS_NUMBERS`, `CLIENT_NAME`
- the email provider key: `RESEND_API_KEY` by default
- the SMS provider credentials: default Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`)

**SMS provider: an operator step.** Texting a US mobile from an application needs a registered sender: A2P 10DLC via Twilio or similar, or a toll-free verified number.
- Until that's set up, urgent alerts go by email with "URGENT" in the subject, and the report lists SMS under "Couldn't do".

**Privacy.** For healthcare-adjacent clients (NEMT, medical, dental), don't put diagnoses or Medicaid IDs in texts. Email carries the trip fields; the transcript stays behind the dashboard link.

**Used by:** kedali-med-transportation (planned).
