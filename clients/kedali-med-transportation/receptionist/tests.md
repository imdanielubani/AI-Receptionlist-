# Kedali: test results

**Suite:** `tests.json`, 20 simulated calls, 10 of them must-pass.

**How the tests run:**
- Runner: `node scripts/sim-tests.mjs clients/kedali-med-transportation/receptionist`.
- The simulated caller uses claude-5.5-haiku. Open or closed is forced through the `office_open` / `next_open` variables.
- `transfer_to_team` is mocked, so no real call is placed.

**Pass bar:** 100% of must-pass cases, and 90% overall.

| Round | Batch | Must-pass | Overall | What changed after it |
|---|---|---|---|---|
| 1 | test_batch_4adc34522e72 | 9/10 (price: sim "loop" error, but no price was given) | 16/20 (80%) | Single-question rule; price wrap-up; "can't see existing rides, never say details are correct"; short job-seeker reply. |
| 2 | test_batch_0c54dfd310c2 | 9/10 (price loop again) | 12/20 (60%) | Transcripts showed the LLM **skipped `check_open`** and guessed open/closed from the clock. Moved it to a **pre-call tool**. Sim callers told to wrap up once answered (most "loops" came from them). |
| 3 | test_batch_b7e83b7d633a | 10/10 | 15/20 (75%) | Build limit of 3 rounds reached; v0 published. |
| Validation | test_batch_3a58b044482f | 10/10 | 16/20 (80%) | One question per turn (with examples), skip companions if already answered, short goodbye, no cancellation-timing claims. Drafted as v1. |
| Validation fix | test_batch_4bf956705e21 | **10/10** | **19/20 (95%)** ✅ | Published **v1**. |

**Published version:** v1, the validation-fix configuration.

## Still failing (not must-pass)
- **"Full recurring dialysis booking"** (v1): the grader's note lists every field as collected and doesn't say what failed. It passed in two earlier rounds, so treat it as noise. Watch it.

## Not yet tested
- **Real voice calls:** latency, voice and interruptions. Use the web test page.
- **Live transfer** to (309) 807-6178.
- **The notify-owner delivery path:** not deployed yet.
