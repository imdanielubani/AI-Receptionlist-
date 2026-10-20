---
name: receptionist-transfer
description: Library module for handing calls to people. Covers who gets which calls, cold vs warm transfer, emergency escalation (emergency services first, then the on-call person), "I want a human" requests, what happens when nobody answers, prompt block, tool config and test cases. Load it from build-receptionist or business-research whenever any call can go to a person.
---

# Transfer

## Owner facts needed
- **Who takes what:** destinations by reason, each a name, a number and the hours they can take calls. E.g. "billing → office manager", "emergencies → on-call technician 24/7".
- **Emergencies:** what counts as one for this business (the industry file has the default triggers), who to send it to, and whether 24/7.
- **When a person asks for a human:** transfer straight away, or try to help first. Default: offer help once, then transfer.

## Implementation (Retell: native `transfer_call`)
- **Destinations:** `predefined` E.164 numbers, put in dynamic variables (`{{transfer_frontdesk}}`, `{{transfer_oncall}}`), so a number change doesn't need a prompt edit. Use one tool per destination with a clear name: `transfer_to_frontdesk`, `transfer_to_oncall`.
- **Mode:**
  - **Warm** (`warm_transfer`) for anything where the person needs context (complex issue, upset caller, qualified lead). Use a short whisper/handoff message summarising the caller and the reason, and `on_hold_music` set to a gentle option.
  - **Cold** (`cold_transfer`) for simple routing ("put me through to billing").
  - **Agentic warm transfer:** only if the owner wants the AI to brief the person and fall back automatically.
- **Settings:**
  - `transfer_ring_duration_ms` 25000.
  - `show_transferee_as_caller: true`, so staff see the caller's number.
  - Use `cold_transfer_mode: sip_refer` only if the client's carrier needs it.
- **When nobody answers:** the agent must come back and take a message with `receptionist-lead-capture`, saying "They're not picking up right now. Let me take your details so they can call you straight back." Test it.
- **Hours:** transfers to people who keep office hours only happen when open. Combine with `receptionist-after-hours`.
- **International:** the destination country must be allowed on the number (`allowed_outbound_country_list`).
- **Cost:** the AI fee stops at transfer, but telephony keeps billing for the transferred leg.

## Prompt block
```
## Transfers
- Transfer to {{frontdesk_name}} ({{transfer_frontdesk}}) when: <reasons>. Only during opening hours.
- Before transferring, tell the caller who you're connecting them to and why, in one sentence. Never transfer silently.
- If a caller asks for a person: offer once to help ("I can probably sort that for you. What's it about?"). If they ask again, transfer. Never keep someone who wants a human.
- If the transfer doesn't connect, apologise briefly and take a message.

## Emergencies
- Emergency means: <industry + owner triggers, e.g. severe bleeding, swelling affecting breathing, gas smell, no heat with vulnerable people at home>.
- If anyone's life or safety may be at risk: tell them to hang up and call <local emergency number: 911 US/CA, 112 or 199 Nigeria, 999 UK, 000 AU> right now. Say it first, clearly, before anything else.
- Otherwise for urgent cases: say you're connecting them to <on-call> straight away, then transfer immediately. Don't collect anything first except their name if they offer it.
- Never give medical, legal or safety advice while handling an emergency.
```

## Post-call fields
`transferred` (boolean), `transfer_target` (string), `transfer_failed` (boolean), `emergency` (boolean), `emergency_type` (string).

## Test cases
1. Caller asks for billing during hours: says who it's connecting to, then transfers to the right destination. (Must pass.)
2. Caller asks for a human twice: offers help once, then transfers on the second ask. (Must pass.)
3. Life-safety emergency: the emergency number comes first, in the first sentence. (Must pass.)
4. Urgent but not life-safety: transfers to on-call immediately, without collecting details first. (Must pass.)
5. Transfer not answered (simulate failure): takes a message. (Must pass.)
6. Person-only request after hours: doesn't attempt the transfer, and takes a message or offers booking instead.
