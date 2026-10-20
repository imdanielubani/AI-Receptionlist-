# Kedali Med Transportation: Build plan

Built 2026-10-20. The owner's six questions were unanswered, so the operator said "build it" and the build uses the **suggested answers as defaults** (see `brief.md` → Assumptions).

## Functions: how each is implemented

| Function | Choice | Why |
|---|---|---|
| Open or closed check | **Native: Retell pre-call code tool** (`pre_session_tools`) | Deterministic and runs before the first word. The in-call version was skipped by the LLM in 2 of 40 sim runs. |
| Transfer urgent calls | **Native: `transfer_call`**, warm, to +1 309-807-6178 | ASSUMED: Kedali's main line, since no dispatch or mobile number was given. |
| FAQ | **Native: prompt + knowledge base** `kedali-faq` | 7 website pages, auto-refresh daily. |
| Ride requests, messages, urgent flags | **Native: post-call analysis** (23 fields) | NEMT rides are confirmed by dispatch, not booked into a calendar. No dispatch software was found. |
| Getting requests to the owner | **Custom function: `notify-owner`** (Cloudflare Worker, Resend email + SMS) | Retell has no per-call owner email or text. **Not deployed:** needs Cloudflare and Resend keys (operator steps). |
| Booking into a calendar | Not used | Same reason as ride requests above. |
| End call | **Native: `end_call`** | none |

## Model and voice
- **Model:** `claude-5.5-haiku`, temperature 0.2. It was measured against `gpt-6.1-sol`, `gpt-6-luna` and `gemini-3.8-flash` on this prompt. It had the fastest median (1262 ms) and best worst case (3099 ms), passed 6/6, and is the cheapest. Details in `docs/platforms/retell/models.md` and `receptionist/model-bench.json`.
- **Voice:** `retell-Grace`, a warm, middle-aged American female voice on Retell's recommended list, in the cheapest voice tier ($0.015/min). It suits older callers in central Illinois.
- **Pace:** `responsiveness` and `interruption_sensitivity` are at 0.8, slightly slower and more patient for elderly callers.

## Phone number
- **Plan:** a Retell local number in area code **309** (Bloomington–Normal), bound to `latest_published`.
- **Cost:** **$2/month. Not bought yet; waiting on operator approval.**
- **After it's bought:** Kedali either publishes the new number, or forwards its existing line to it. Forwarding means the transfer target must become a different number, such as the owner's mobile, or calls would loop.

## Estimated running cost
- **Per minute:** voice infra $0.055 + TTS $0.015 + LLM $0.0032 + KB $0.005 + telephony $0.015 + PII removal $0.01 ≈ **$0.10/min**.
- **At an assumed 300 minutes/month** (about 100 calls of 3 min; owner not asked): ≈ $31 usage + $2 number ≈ **$33/month**.
- **Notifications** (Resend free tier; Twilio SMS about $0.01/text plus number and registration fees) add a few dollars.

## Operator steps needed
1. Approve the phone number ($2/mo).
2. Cloudflare API token + account ID, so I can deploy `notify-owner`.
3. Resend API key, for emailed requests and alerts.
4. Optional, for urgent texts: a Twilio account with an SMS-registered number.
5. The owner's answers to the six questions, especially the real dispatch number.
