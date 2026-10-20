---
name: receptionist-after-hours
description: Library module for handling calls differently outside opening hours. Works out open or closed deterministically (a platform code tool, not LLM time maths), sets the after-hours greeting, routes emergencies to on-call, lets booking and messages work 24/7, says when the business opens next, and covers holidays. Includes the prompt block, the code tool and test cases. Load it from build-receptionist or business-research whenever opening hours change what the receptionist does.
---

# After hours

## Owner facts needed
- **Opening hours per day,** including lunch closures and split shifts. Usually on the Google profile or website, so check first.
- **Holidays and closures** for the next 12 months. Default: the public holidays of the client's country.
- **What happens after hours:**
  - Emergencies: on-call transfer, or a message plus an urgent alert.
  - Booking: allowed 24/7 (default: yes, if booking is live).
  - Everything else: take a message.

## Implementation

**Time zone.** Set the agent's `timezone` to the client's IANA zone (e.g. `Africa/Lagos`). The platform default is Los Angeles, which silently breaks everything below.

**Hours as data.** Put these in `default_dynamic_variables` so changes don't need a prompt edit:
- `business_hours_json`: `{"mon":[["08:00","17:00"]],"tue":[...],"sat":[["09:00","13:00"]],"sun":[]}`
- `holidays_json`: `["December 25","December 26","January 1"]`, as month and day in the same format the platform prints dates. Update yearly for moving holidays.

**Open or closed: computed, not guessed.** LLMs get weekday and time maths wrong. On Retell, use a `code` tool named `check_open` as a **pre-call tool**, in the agent's `pre_session_tools`, *not* an in-call tool. Its outputs become `{{office_open}}` / `{{next_open}}` before the first word, and the LLM can't skip it. As an in-call tool, Claude Haiku skipped it in tests and guessed from the clock. It runs on the platform, so there's nothing to host, and it needs no secrets. In simulations, set `office_open` / `next_open` through the test's `dynamic_variables`, because pre-call tools don't run there.

```javascript
// Retell code tool: check_open. Reads dynamic variables; returns open/closed and when we next open.
const hours = JSON.parse(dv.business_hours_json || "{}");
const holidays = JSON.parse(dv.holidays_json || "[]");
const now = dv.current_time;                 // e.g. "Thursday, March 28, 2024 at 11:46 PM WAT"
const hour = Number(dv.current_hour);        // e.g. 23.77 (fraction, agent timezone)
const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const today = names.findIndex((n) => now.startsWith(n));
const toH = (t) => { const [h, m] = t.split(":").map(Number); return h + m / 60; };
const isHoliday = holidays.some((h) => new RegExp(`\\b${h},`).test(now));
const ranges = isHoliday ? [] : hours[keys[today]] || [];
const open = ranges.some(([a, b]) => hour >= toH(a) && hour < toH(b));
let next = null;
const later = ranges.find(([a]) => toH(a) > hour);
if (later) next = `today at ${later[0]}`;
for (let i = 1; !next && i <= 7; i++) {
  const r = hours[keys[(today + i) % 7]] || [];
  if (r.length) next = `${i === 1 ? "tomorrow" : names[(today + i) % 7]} at ${r[0][0]}`;
}
return { open, holiday: isHoliday, next_open: next || "soon" };
```
- Map `open`, `holiday` and `next_open` to dynamic variables with `response_variables`.
- Holiday detection on future days isn't handled, so `next_open` may name a holiday. Note it as an assumption if the holiday list is long.
- For other platforms, use their equivalent code step, or have the inbound-call webhook set `is_open` (a custom function).
- On conversation-flow agents, use a code node at the start instead of a tool.

## Prompt block
```
## Opening hours
- The office is open right now: {{office_open}} (set by the pre-call check_open). Use it, never your own reasoning about the time.
- If closed: greet with "Thanks for calling <business>. We're closed right now and open again {{next_open}}, but I can still help."
- When closed: you can still answer questions, <book appointments>, and take messages. Don't offer transfers to <office-hours staff>.
- Emergencies after hours: <on-call transfer | take details and mark urgent so the owner is alerted straight away>. The emergency-number rule always applies.
- Never say the business is open based on anything other than {{office_open}}.
```

## Post-call fields
`after_hours` (boolean), `after_hours_action` (enum: message, booking, emergency_transfer, faq_only).

## Test cases
Simulations can't change the real clock. Override `business_hours_json`, or override `current_time` / `current_hour` in the test case's dynamic variables, to force each state.
1. Closed, caller wants the office: says closed, gives the next opening time, takes a message. (Must pass.)
2. Closed, emergency: follows the after-hours emergency path, with the emergency number first if it's life-safety. (Must pass.)
3. Open: normal flow, and transfers are offered.
4. Holiday: treated as closed, even on a weekday.
5. Closed, wants to book: books normally (if booking is live).
6. Unit check: run the `check_open` code against 5 fixed times (weekday morning, lunch closure, late night, Sunday, holiday) and confirm each result before deploying.
