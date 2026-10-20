# Retell: model pick

Last verified: 2026-10-20 · spec revision 2026-10-19-becf7f8

## Current pick: `claude-5.5-haiku`
Reuse it for builds until 2026-11-19 (30 days), unless the model list changes or a deprecation notice names it.

## How it was chosen (2026-10-20, Kedali build)
**Candidates.** The newest fast model in each provider's line, from the `LLMModel` enum, with none named in deprecation notices: `gpt-6.1-sol`, `gpt-6-luna`, `claude-5.5-haiku`, `gemini-3.8-flash`. The platform default `gpt-5.6-terra` was skipped because it's older.

**Method.** `scripts/model-bench.mjs` ran the client's real prompt, tools and knowledge base through `agentPlaygroundCompletion`, with tools mocked.
- 6 cases × 2 runs: booking, 2 FAQ, a price refusal, a transfer tool call, and a 911 emergency refusal.
- Times are wall clock from Normal-ish Windows → Retell, so they include network and the tool loop. They're good for comparing models, but they aren't voice latency.

| Model | Median | Max | Passed | $/min (std) |
|---|---|---|---|---|
| claude-5.5-haiku | **1262 ms** | **3099 ms** | 6/6 | $0.0032 |
| gpt-6-luna | 2194 ms | 8379 ms | 6/6 | $0.0032 |
| gpt-6.1-sol | 2851 ms | 5408 ms | 6/6 | $0.064 |
| gemini-3.8-flash | 3812 ms | 5513 ms | 6/6 | $0.048 |

**Notes**
- Fast tier and ultrafast were left off. `model_ultrafast` exists only on `gpt-6.1-sol` and would cost $0.128/min. Revisit only if real-call e2e p50 goes over 2.5 s.
- Confirm real voice latency from the first web or phone test calls (`latency.e2e.p50` in get-call).
- Raw results: `clients/kedali-med-transportation/receptionist/model-bench.json`.
