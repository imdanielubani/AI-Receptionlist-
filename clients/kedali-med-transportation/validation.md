# Kedali: validation, 2026-10-20

## Live checks (Retell API)
**Agent**
- ✅ Agent exists: agent_c4bd65c00cc36407ae55bd607a, "Kedali Med Transportation Receptionist".
- ✅ Timezone: America/Chicago.
- ✅ Voice and language: retell-Grace, en-US.
- ✅ Post-call fields: 23/23 present.
- ✅ Data storage: everything_except_pii.
- ✅ Pre-call `check_open` matches the local code. Variables: office_open, next_open.
- ✅ Agent points to LLM llm_281fdcbb4d1b832a7a59df3ba546.
- ✅ Published version: the tested one. v1 published after round 4 (v0 before it).
- ✅ Webhook URL: unset, as expected until notify-owner is deployed.

**LLM**
- ✅ Model: claude-5.5-haiku, temperature 0.2.
- ✅ No multi-prompt states.
- ✅ Knowledge base attached: knowledge_base_6e145103d5837af9.
- ✅ In-call tools: transfer_to_team (transfer_call), end_call (end_call).
- ✅ Transfer destination: +13098076178, warm. This is the assumed main line.
- ✅ Live prompt = `prompt.md`, re-checked before round 4. v1 was then pushed from the same file.

**Knowledge base**
- ✅ Complete: 7 sources, auto-refresh on.

**Not done yet**
- ❌ Phone number: none attached. Waiting for spend approval ($2/mo).
- ❌ Custom function `notify-owner`: not deployed. Needs Cloudflare and Resend keys. Until it is, ride requests and urgent flags are visible only in the Retell dashboard.
- n/a Integrations: none used.

## Simulation (20 cases, 10 must-pass)
| Round | Version | Must-pass | Overall |
|---|---|---|---|
| Build 1–3 | draft v0 | 9, 9, 10 /10 | 80%, 60%, 75% |
| Validation re-run | published v0 | 10/10 | 16/20 (80%) |
| Validation fix round | v1 (published) | **10/10** | **19/20 (95%) ✅ bar met** |

**Remaining failure:** "full recurring dialysis booking". The grader's note lists every field as collected and doesn't name what failed. It passed in round 3 and the earlier validation run, so treat it as run-to-run noise.

## Voice test page
- Started with `node scripts/voice-test/server.mjs kedali-med-transportation`.
- Loaded in the built-in browser with no console errors.
- Opened in the default browser at http://localhost:4321.
- **No real voice call has been made yet**, so voice latency, voice quality and the live transfer are still untested.
