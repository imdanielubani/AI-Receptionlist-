---
name: validate-receptionist
description: Validate a client's receptionist after every build or change. Confirms on the live platform that the agent exists and runs the tested published version, that every function is registered and reachable, and that integrations authenticate. Re-runs the simulation tests, launches a local browser test page (a voice orb running a Retell web call) and opens it, writes the Built / Assumed / Couldn't do report, and gives the operator three test-call scenarios for the business type. Run it automatically at the end of build-receptionist and after any change to a live receptionist.
---

# Validate receptionist

Trust nothing from the build log: check the live platform. Write the results to `clients/<slug>/validation.md` (dated), then into `report.md`.

## Step 1: Live checks

Use the MCP server, or REST with the key from `.env`. Every check is ✅ / ❌ with the actual value seen. Retell endpoints are shown; use the equivalents on other platforms.

**Agent**
- `getAgent <agent_id>`: the agent exists and its name matches the client.
- `timezone` is the client's zone, not the default.
- The voice and language match `build-plan.md`.
- `post_call_analysis_data` has every field the library skills added.
- `webhook_url` is set if lead capture or notifications need it.
- `listAgentVersions`: the published version is the one that passed tests in `tests.md`.

**Brain**
- `getRetellLLM` (or `getConversationFlow`): `model` matches the pick in `build-plan.md` and `docs/platforms/<platform>/models.md`.
- The model isn't named in any deprecation in `changes.md`.
- No `states` (multi-prompt is retired).
- `knowledge_base_ids` matches `deploy.md`.

**Functions registered.** Every row in `functions.md` exists as a tool on the LLM, with the same name and type.
- **Custom tools:**
  - The URL equals the deployed Worker URL in `deploy.md`.
  - An **unsigned** POST returns 401, which proves it's deployed and checking signatures.
  - A **signed** sample request returns 2xx within 2.5 s. Sign it with HMAC-SHA256 of the raw body, keyed with `RETELL_API_KEY`, in the platform's header format (see `docs/platforms/<platform>.md`).
- **Code tools:**
  - The code matches the client folder copy.
  - It runs locally against fixed sample inputs, e.g. the `check_open` cases from `receptionist-after-hours`.
- **Transfer tools:** every destination is valid E.164 and matches `brief.md`.
- **Webhook URL:** an unsigned POST returns 401.

**Integrations authenticate.** For each `app_id` in `deploy.md`:
- `testAppAuth` passes and `getApp` shows `connected`.
- For each integration tool, fetch the tool schema (`getAppToolSchema`) and confirm the configured inputs (e.g. Cal.com event type ID) still resolve.

**Knowledge base.** `getKnowledgeBase` shows the status is complete and the sources count matches what was added.

**Phone number** (if attached)
- `getPhoneNumber` shows `inbound_agents` points at this agent with `agent_version: "latest_published"` (or the tested version).
- `fallback_number` is set if the owner gave one.
- If SIP was imported, the status is healthy.

**Cost sanity.** The model and voice rates multiplied by the brief's expected minutes are within the estimate in `build-plan.md`.

If a check fails and the fix is ours (wrong field, missing tool, unpublished version), fix it through `build-receptionist` ("Changing a live receptionist") and re-run the check. If the fix needs the operator, it goes in "Couldn't do" with a walkthrough.

## Step 2: Simulation test

1. Re-run the suite from `tests.md` against the **published** version. Retell: `createBatchTest` with the saved test case definitions, poll `getBatchTest` until `complete`, then `listTestRuns` for failures.
2. Pass bar, as in the build: 100% on emergency, transfer and compliance cases, and 90%+ overall.
3. On failure:
   - read the run transcript (`getTestRun`)
   - fix it
   - re-publish
   - re-run, with at most 2 rounds here
   - record what still fails
4. For a change to a live receptionist, the must-pass cases plus the cases for the changed area are enough.

## Step 3: Browser test page (voice orb)

1. **Start the local page** in the background:
   ```bash
   node scripts/voice-test/server.mjs <client-slug>
   ```
   - It reads the agent ID from `deploy.md` (`Agent ID: agent_...`) and the key from `.env`.
   - It serves `http://localhost:4321`, on this machine only.
   - The page's Retell web SDK sends its requests through this server, so the API key never reaches the browser. The server only allows web calls to this one agent.
   - Use `--version N` to test an unpublished draft version, and `--port` if 4321 is taken.
2. **Check that it loads** in the built-in browser: no console errors, and the title shows the client name. Don't start a call there.
3. **Open it in the operator's default browser** so their microphone works:
   - Windows: `Start-Process http://localhost:4321`
   - macOS: `open ...`
4. **Tell the operator** the page is open:
   - Tap the orb and talk. The orb moves with the agent's voice; the ring moves with theirs.
   - After hanging up, the page shows the transcript, response time (target p50 under 2.5 s), the summary and the extracted fields.
   - "Test variables" lets them force states, such as after-hours.
   - Web calls bill per minute at normal rates.
5. **After they've called,** read their test calls back (`listCalls` filtered to this agent, with `metadata.source = local-voice-test`). Note response times and anything that went wrong in `validation.md`. If p50 is over 2.5 s, revisit the model and voice choice.

## Step 4: Report (`clients/<slug>/report.md`)

Write it per CLAUDE.md, from the validation results, not the build plan:
- **Built:** only what passed step 1.
  - the phone number to call (or "web test page only")
  - agent and version
  - model and voice
  - each function and integration with its status
  - simulation pass rate
  - how to open the test page again:
    ```bash
    node scripts/voice-test/server.mjs <slug>
    ```
- **Assumed:** everything under `## Assumptions` in `brief.md`, plus defaults chosen during the build (model, voice, callback promise, after-hours behaviour). One line each, so the operator can correct them.
- **Couldn't do:** every ❌ from step 1 and every unfinished operator step. Each one gets a plain-English TLDR walkthrough (format in CLAUDE.md) and what works in the meantime.

Summarise the report to the operator in chat: three short sections.

## Step 5: Three test-call scenarios

Give the operator three scenarios to try on the test page or the real number. Draw them from `docs/industries/<business-type>.md` and this client's call flow:
1. **The bread-and-butter call:** the most common reason people call this kind of business, usually booking or a quote.
2. **The high-stakes call:** an emergency, an upset caller, or a must-transfer case for this industry.
3. **The trap:** something the receptionist must *not* do, such as advice it can't give, a price it can't quote, or after-hours when the office is closed (use "Test variables" to force closed).

Write each one as:

```
**1. <name>**
You are: <who, one line>
Say: "<opening line in the caller's words>" then <what to push on>
It should: <2–3 checkable outcomes, e.g. offers two times, reads back your number, books it>
```

Save the scenarios at the end of `report.md` too.
