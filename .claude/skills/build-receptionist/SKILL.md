---
name: build-receptionist
description: Build, test, publish and deploy a client's AI receptionist on the voice platform, and attach a phone number. Use after business-research is done and the owner has answered their questions (the drafts in clients/<slug>/receptionist/ no longer say DRAFT). Also use for changes to a live receptionist. Prefers native integrations, writes and deploys custom functions only when nothing native exists, picks the newest fast model by checking the platform's model list and measuring latency, and saves every payload, ID and result to the client folder.
---

# Build receptionist

This skill takes the researched drafts and turns them into a live receptionist with a phone number. Every decision is ours. The operator only gets involved for spending money and for steps that physically need them (see "Operator steps" at the end).

## Step 0: Preconditions

- `clients/<slug>/brief.md` has the owner's answers, and `receptionist/{call-flow,prompt,functions}.md` no longer say `Status: DRAFT`. If not, run `business-research` or wait for the answers. Don't build on drafts.
- `docs/platforms/<platform>.md` is fresh (≤ 90 days old and not marked partial). If not, run `platform-research` first.

## Step 1: Read first

Read all of these before touching the platform:
1. **Platform:** `docs/platforms/<platform>.md`, plus `<platform>/capabilities.md`, `setup-recipes.md`, `custom-functions.md` and `changes.md`. Check that no upcoming change in `changes.md` affects this build (e.g. retired agent types).
2. **Industry:** `docs/industries/<business-type>.md`, especially compliance, emergencies, and the "Lessons from builds" section.
3. **Client:** `brief.md` (answers + assumptions) and the three `receptionist/` drafts.
4. **Library skills:** load each one the call flow uses:

| Call flow has | Load skill |
|---|---|
| booking new appointments | `receptionist-booking` |
| cancel / reschedule | `receptionist-cancel-reschedule` |
| answering questions about the business | `receptionist-faq` |
| taking messages, new enquiries, callback requests | `receptionist-lead-capture` |
| handing calls to people, emergencies | `receptionist-transfer` |
| different handling outside opening hours | `receptionist-after-hours` |

Each library skill gives a prompt block, tool config, post-call fields and test cases. Merge them into the build.

## Step 2: Plan (`clients/<slug>/build-plan.md`)

For every function in `functions.md`, choose how to implement it. Take the **first** option on this list that fully works:

1. **Native platform feature:** built-in tool or setting (e.g. Retell `transfer_call`, `end_call`, knowledge base, post-call analysis).
2. **Native integration:** the platform's built-in connector to the client's system (e.g. Retell's Cal.com, Calendly, HubSpot, GoHighLevel, Salesforce, Zoho, Dynamics, Zendesk).
   - Retell: connect it with `create-app`. Providers that use an API key connect fully by API, using the client's key. OAuth providers need a one-time owner click through `connect-app` (an operator step).
3. **Platform code tool:** runs on the platform, so there's nothing to host. Retell's `code` tool is JavaScript in a sandbox with `fetch`, a 5–60 s timeout, and no `require` or `Intl`.
   - Only for logic without secrets: dynamic variables are stored in plaintext.
   - Good for calculations, formatting, and low-risk public HTTP reads.
4. **Custom function:** our own endpoint (step 5). Use it only when 1–3 can't do the job. Write down *why* in the plan.

Also put in the plan:
- the model and voice choice (step 3)
- the phone number plan (step 9)
- every operator step needed
- estimated monthly cost: a per-minute estimate times the expected minutes (from the brief), plus number and add-on fees

## Step 3: Choose the model (newest fast model, measured)

Never accept the platform's default model, and never pick a model when a newer model in the same line exists.

**Reuse.** If `docs/platforms/<platform>/models.md` is ≤ 30 days old, the model list hasn't changed since, and no model deprecation has been announced since, reuse its pick and skip to the voice choice.

**Otherwise, measure:**
1. **List the models.** Get the current model list from the platform:
   - Retell: the `model` enum from `get_api_endpoint_schema createRetellLLM` via MCP, or from `snapshot/current/openapi.yaml`.
   - Also note speech-to-speech models (`s2s_model`). Use them only if the call flow needs no tools.
2. **Drop retiring models:** any model named in a deprecation or replacement notice in `changes.md` or `docs/.../deprecation-notice/`.
3. **Pick candidates:** the newest generation of each provider's fast or small line, plus any model that supports a faster tier (Retell: `model_ultrafast` is only on `gpt-6.1-sol`; `model_high_priority` is the "Fast tier" at about 1.5× price). Usually 3–5 models.
4. **Gather published numbers:** read the platform's latency guidance (Retell: `reliability/check-estimated-latency` and `troubleshoot-latency`; the target is e2e p50 under about 2.5 s, and the platform can reach about 600 ms) and the pricing page (per-minute cost per model).
5. **Measure.** For each candidate:
   - Create a throwaway LLM and agent named `zz-modeltest-<model>`, with the client's real prompt and tools.
   - Run the same 6 turns through the text playground (Retell `agentPlaygroundCompletion`): 4 normal turns, 1 that must trigger a tool call, and 1 that must refuse (compliance). Time each request.
   - Record the median and worst time, whether the tool call was right, and whether the refusal held.
   - Delete the throwaway resources. Text tests bill per message at chat rates, a few cents in total.
6. **Pick** the fastest median among candidates that got the tool call **and** the refusal right. If two are within about 15%, take the newer one, then the cheaper one.
   - Leave the paid speed tiers off by default. Turn them on only when the industry is emergency-heavy (medical, HVAC no-heat, legal arrests), and note the cost.
   - Temperature: 0–0.3 (tool calling and data capture).
7. **Record it** in `docs/platforms/<platform>/models.md`: date, spec revision, candidates, measurements and the pick. Reference it from the client's `build-plan.md`.

**Voice.** Pick from the platform's voice list (Retell `list-voices`):
- Match the callers' language and accent (e.g. a Nigerian English voice for Lagos callers, if one exists).
- Prefer the cheapest-latency TTS tier ($0.015/min on Retell) unless the business is premium.
- Write the voice ID and the reason into the plan.

## Step 4: Connect integrations

For each integration in the plan:
- **The client's credentials** go in `.env` as `<SLUG>_<PROVIDER>_API_KEY` (e.g. `BRIGHT_SMILE_CALCOM_API_KEY`), per the key rule in CLAUDE.md.
- **API-key providers:**
  1. `create-app` with that key.
  2. `test-app-auth`. It must report `connected`.
  3. Record the `app_id` in `deploy.md`.
- **OAuth providers:**
  1. Create the app.
  2. Get the `connect-app` link.
  3. Put it in the operator walkthrough.
  4. Carry on with the rest of the build. Re-check `get-app` status before testing the tools that need it.
- **Configure the integration tools** (e.g. one Cal.com Check Availability + Book Appointment pair per event type) as `integration_app` tools on the LLM. Get the exact fields from `get-app-tool-schema`.

## Step 5: Custom functions (only if the plan needs them)

**Where the code lives:**
- **Client-specific code** goes in `clients/<slug>/functions/<name>/`.
- **Generic functions** reused across clients (e.g. `notify-owner`) go in `functions/<name>/` at the repo root. They're deployed once per client, with that client's config passed as environment variables.

**Default host:** Cloudflare Workers. Requests are fast with no cold starts, there's a free tier, and it deploys from the CLI.
- Deploy with `npx wrangler deploy`, using `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from `.env`.
- Secrets go in with `npx wrangler secret put` (values read from `.env`, never typed into files).
- Name each Worker `<slug>-<function>`.
- If the Cloudflare token is missing, that's an operator step (walkthrough below). Build everything else, and list the function under "Couldn't do" until the token arrives.

**Every function must:**
- **Verify the platform's request signature** (Retell: `X-Retell-Signature`, an HMAC of the raw body checked with the Retell API key). Reject anything unsigned.
- **Respond fast enough:**
  - **Mid-call:** under 2.5 s. The tool's `timeout_ms` is 8000. The agent says a short filler while it waits (`speak_during_execution`).
  - **Post-call webhooks:** return 2xx within 10 s, and do heavy work after responding (`ctx.waitUntil`).
- **Be safe to repeat:** webhooks retry up to 3 times, so dedupe on the call ID.
- **Fail with a message the agent can say,** e.g. `{ "ok": false, "say": "I can't reach the calendar right now. I'll take your details and the team will call you back." }`.
- **Keep logs minimal:** no full transcripts and no personal data beyond what's needed to debug.

**After deploying:** smoke-test each function with a correctly signed sample request and with an unsigned one, which must get 401. Record the URLs in `deploy.md`.

**Feed it back:** add the function's contract to `docs/platforms/<platform>/custom-functions.md` if it isn't there.

## Step 6: Create the brain (LLM)

1. **Assemble the payload** in `clients/<slug>/receptionist/llm.json`:
   - `prompt.md` (with the library prompt blocks merged in)
   - tools (native, integration, code and custom)
   - `default_dynamic_variables`: business name, hours JSON, transfer numbers and anything else that changes
   - knowledge base IDs
   - `model` and temperature
   - `start_speaker: "agent"` and `begin_message`
2. **Retell:** use a single prompt (no `states`; see `changes.md`). If the call flow has clearly separate phases that one prompt can't hold, use `conversation-flow` instead.
3. **Check every field** against the spec before sending (`get_api_endpoint_schema`).
4. **Create it,** and record the ID in `deploy.md`.

## Step 7: Create the agent

1. **Assemble the payload** in `clients/<slug>/receptionist/agent.json`. Name it `<Client Name> Receptionist`. Fields:
   - **voice:** the voice from step 3, plus `language`.
   - **`timezone`:** always set it from the client's location; never leave the platform default.
   - **transcription:** `boosted_keywords` (business name, staff names, services, local place names) and a `pronunciation_dictionary` for names the voice gets wrong.
   - **call limits:** `end_call_after_silence_ms` 30000 and `max_call_duration_ms` 1200000.
   - **`post_call_analysis_data`:** the fields from each library skill used.
   - **data and privacy:** `data_storage_setting` and `pii_config` (use `everything_except_pii` for medical, legal and financial clients).
   - **webhooks:** `webhook_url` and `webhook_events`, if lead capture or notifications use them.
   - **Leave off:** ambient sound, and voicemail detection (it's inbound).
2. **Create it,** and record the agent ID in `deploy.md`.

## Step 8: Test (before publishing)

1. **Build the test suite** in `clients/<slug>/receptionist/tests.md`. Include:
   - every library skill's test cases
   - a case for each call reason in the call flow
   - an angry caller
   - an emergency
   - a caller who asks for a human
   - spam or a sales pitch
   - a question the receptionist must not answer
   - after-hours (if used)
   - a caller who mumbles or changes their mind
2. **Run them** as the platform's automated simulations (Retell: `create-test-case-definition` for each, then `create-batch-test`, then poll `get-batch-test`, then `list-test-runs` for failures).
3. **Pass bar:**
   - 100% on emergency, transfer and compliance cases.
   - ≥ 90% overall.
   - Fix the prompt or tools and re-run. After 3 rounds, stop. Report the remaining failures honestly instead of looping.
4. **Record** the pass rate, failures and fixes in `tests.md`. Testing bills at production chat rates, so keep the suite under about 25 cases.

## Step 9: Publish and attach a phone number

1. **Publish** the tested version (Retell `publishAgentVersion`), and record the version number.
2. **Phone number:**
   - **US or Canada:** buy a local number in the client's area code (Retell `createPhoneNumber`).
     - Bind it with `inbound_agents: [{agent_id, weight: 1, agent_version: "latest_published"}]` and a `nickname` of the client slug.
     - Set `fallback_number` to the owner's line, if known, for when all lines are busy.
     - **This costs money (Retell: $2/month).** Ask the operator once, in one line, with the total monthly cost of the build ("Buy a (512) number for $2/mo? Running cost ≈ $X/mo at Y minutes."), unless they already approved spending for this build.
   - **Any other country:** the client's calls reach the platform over SIP, either through their own carrier or a local SIP provider (Retell `importPhoneNumber`). That's an operator step: write the walkthrough. Until it's done, the agent is testable by web call.
   - **Keeping their existing number:** the owner sets call forwarding (all calls, or only when busy/no answer) from their current line to the new number. That's an operator/owner step: write the walkthrough with their carrier's forwarding code, if it's findable.
3. **Final check:**
   - read back the number and agent binding (`getPhoneNumber`)
   - confirm the agent's published version is the tested one
   - confirm any OAuth integrations show `connected`

## Step 10: Save and report

Save everything in `clients/<slug>/`:
- **`receptionist/`:** `prompt.md` (final), `llm.json`, `agent.json`, `tests.md`, and `call-flow.md` / `functions.md` updated to match what was built.
- **`functions/`:** the code for any client-specific functions.
- **`deploy.md`:**
  - platform
  - agent ID and published version
  - LLM or flow ID
  - knowledge base IDs and app IDs
  - phone number and its binding
  - function URLs
  - model and voice (with reasons)
  - webhook URL
  - secrets by **name** only
  - monthly cost estimate
  - deploy date
- **`report.md`:** Built / Assumed / Couldn't do, per CLAUDE.md.
  - **Built** includes the number to call, plus a ready list of 5 things to try on a test call.
  - **Couldn't do** holds each operator step, with its walkthrough.

**Feed back what you learned:**
- platform gotchas into `docs/platforms/<platform>.md`
- industry lessons into the "Lessons from builds" section of `docs/industries/<type>.md`

**Then run `validate-receptionist`.** It checks the live platform, re-runs the simulations, opens the voice test page, and writes the final `report.md`. Don't report a build as done until validation has run.

## Changing a live receptionist

1. **Make the change.** Retell: update the LLM or agent; this edits the draft.
2. **Re-run the affected tests**, plus all the emergency, transfer and compliance tests.
3. **Publish.** Numbers bound to `latest_published` pick it up automatically.
4. **Log it.** Add the change to `deploy.md` with the date and version, and update `report.md` if what's live changed.

## Operator steps (plain-English walkthroughs)

When anything needs the operator or the owner to act, write it in this TLDR format, in plain English with no jargon, using the exact button names. Batch all of them into one message at the end of the build, unless one blocks everything.

```
**What you need to do:** <one line: what, and why it matters>
1. <step>
2. <step>
3. <step>          (5 steps max; link straight to the page)
**Send me:** <exactly what to paste back>, or "nothing, just tell me when it's done"
**Until then:** <what already works, what doesn't>
```

Typical ones:
- Cloudflare token for custom functions
- the client's Cal.com or CRM API key, or an OAuth connect click
- forwarding the existing business line
- SIP setup outside the US/Canada
- SMS approval (A2P, about 2–3 weeks, US only)
- approving spend
