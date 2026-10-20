Built v0 2026-10-20. See ../build-plan.md and ../deploy.md for what is live.

# Kedali Med Transportation: Functions

The platform is Retell. Statuses come from `docs/platforms/retell.md` (the "Verified 2026-10-20" section). `docs/platforms/retell/capabilities.md` doesn't exist yet: the full `platform-research` run happens before the build, and these statuses will be re-checked against it.

| Function | When it fires | Inputs | Output used | Platform status | Notes |
|---|---|---|---|---|---|
| `check_open` | **Pre-call** (before the first word), via agent `pre_session_tools` | dynamic variables `business_hours_json`, `holidays_json`, `current_time`, `current_hour` | `open`, `next_open` | **Native** (Retell code tool) | From `receptionist-after-hours`. The agent timezone must be `America/Chicago`. |
| `transfer_to_team` | Rider waiting, late driver, will-call return, same-day discharge, complaint, wants a person: **only when open** | none (destination +13098076178, ASSUMED main line) | none | **Native** (`transfer_call`, warm) | Whisper with rider, location and time. 25 s ring. If no answer, the agent marks it urgent and promises a callback. [[OWNER: number + hours]] |
| ~~`alert_owner`~~ | Dropped | none | none | n/a | Mid-call alert replaced by the post-call `urgent` flag → notify-owner text. That's one moving part fewer, at the cost of about 1 minute of delay. |
| Trip request + urgent delivery | After every call with `message_taken` or `trip_request` | post-call analysis fields (below) | none | **Native capture + custom delivery** | Retell `post_call_analysis_data` extracts the fields; the `call_analyzed` webhook goes to the notify-owner Worker, which emails and texts the owner. Medical details go as a dashboard link only (HIPAA). |
| FAQ answers | Any question | none | none | **Native** (prompt + knowledge base) | KB `kedali-faq` from the website pages (FAQ, services, the 3 service detail pages, contact), with auto-refresh on. Small facts live in the prompt. |
| `end_call` | After the closing, emergency instruction, or spam | none | none | **Native** | none |
| Booking into a calendar | Not used | none | none | n/a | NEMT rides are requests that dispatch confirms. No dispatch software is visible; if the owner names one with an API, revisit. Per `receptionist-booking` ladder step 4. |
| SMS confirmation to the caller | Not used (for now) | none | none | Native, but needs A2P | US A2P approval takes ~2–3 weeks at $20/mo. Optional later. |

## Post-call analysis fields (Retell `post_call_analysis_data`)
- **Trip request:**
  - `trip_request` (boolean)
  - `rider_name`, `caller_name`, `caller_relationship`, `callback_number`
  - `pickup_address`, `destination`, `appointment_datetime`
  - `trip_type` (enum: one_way, round_trip_set_time, round_trip_will_call)
  - `recurring` (string)
  - `mobility` (enum: walks, cane_or_walker, own_wheelchair_manual, own_wheelchair_power, scooter, stretcher_requested, other)
  - `companions` (number)
  - `payer` (enum: medicaid, private_pay, facility, unknown), `medicaid_plan`, `medicaid_id`
  - `special_needs` (string)
- **Urgent and changes:**
  - `urgent` (boolean), `urgent_reason` (enum: rider_waiting, late_driver, will_call_ready, discharge_today, same_day_cancel, complaint, other)
  - `booking_change` (enum: none, cancel, reschedule, other), `change_details`
- **Messages and FAQ:**
  - `message_taken` (boolean), `reason` (string)
  - `unanswered_question` (string)
- **After hours, transfers and emergencies:**
  - `after_hours` (boolean)
  - `transferred` (boolean), `transfer_failed` (boolean)
  - `emergency` (boolean)

## Agent settings to apply at build
- **Locale:** `timezone` `America/Chicago`, `language` `en-US`.
- **Privacy:** `data_storage_setting` `everything_except_pii` and `pii_config` post-call (HIPAA: Medicaid IDs and health details).
- **Transcription:** `boosted_keywords` Kedali, Normal, Bloomington, Peoria, Champaign, Springfield, dialysis, Medicaid, ModivCare, MTM, the 13 county names, and John.
- **Call limits:** `end_call_after_silence_ms` 30000 and `max_call_duration_ms` 1200000.
- **Pace:** the callers skew elderly, so slightly lower `responsiveness` gives a slower, patient pace (tune in tests).
- **No voice ID or caller voiceprint features** (Illinois BIPA).
