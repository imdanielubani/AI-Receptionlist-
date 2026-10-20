# Kedali Med Transportation: Deployment

- **Platform:** Retell
- **Agent ID:** agent_c4bd65c00cc36407ae55bd607a ("Kedali Med Transportation Receptionist")
- **Published version:** 1 ("v1 validation fixes", 2026-10-20). v0 was the initial build.
- **LLM ID:** llm_281fdcbb4d1b832a7a59df3ba546 (single prompt, no states)
- **Model:** claude-5.5-haiku, temperature 0.2. See `build-plan.md`.
- **Voice:** retell-Grace · en-US · timezone America/Chicago
- **Pre-call tools:** `check_open` (code), which sets `{{office_open}}` and `{{next_open}}`
- **In-call tools:**
  - `transfer_to_team`: warm transfer to +13098076178 (ASSUMED: main line)
  - `end_call`
- **Knowledge base IDs:** knowledge_base_6e145103d5837af9 (`kedali-faq`, 7 website URLs, auto-refresh)
- **Integration app IDs:** none
- **Phone number:** none yet. Waiting on approval for a 309 local number ($2/mo).
- **Function URLs:** none yet. `notify-owner` is not deployed (needs Cloudflare and Resend keys).
- **Webhook URL:** none yet. It will be the `notify-owner` `/webhook`, events `call_analyzed`.
- **Data:** `data_storage_setting` everything_except_pii; 23 post-call analysis fields
- **Secrets used (names only):** RETELL_API_KEY. Planned: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, RESEND_API_KEY, TWILIO_*
- **Monthly cost estimate:** about $0.10/min, about $33/mo at 300 min (see `build-plan.md`)
- **Deployed on:** 2026-10-20 (agent only; no phone line yet)

**To test in the browser:**

```bash
node scripts/voice-test/server.mjs kedali-med-transportation
```

**To rebuild the payloads after changing `prompt.md`:**

```bash
node clients/kedali-med-transportation/receptionist/assemble.mjs
```

## Change log
- 2026-10-20 · v0 · Initial build. Suggested answers used as defaults. `check_open` moved from an in-call tool to a pre-call tool after test round 2.
- 2026-10-20 · v1 · Validation fixes: one question per turn, no re-asking companions, short goodbyes, no cancellation-timing claims. Sim: must-pass 10/10, overall 19/20 (test_batch_4bf956705e21).
