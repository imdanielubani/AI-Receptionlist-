---
name: receptionist-lead-capture
description: Library module for taking messages, new enquiries and callback requests, and getting them to the owner fast. Covers what to collect, capturing it with post-call analysis, delivery to the client's CRM through a native integration or to the owner by email or text through a shared notify-owner function, urgent alerts, prompt block and test cases. Load it from build-receptionist or business-research for every receptionist (it is also the fallback for failed bookings, transfers and after-hours).
---

# Lead capture and messages

## Owner facts needed
- **Where leads go:** their CRM if they use one (HubSpot, GoHighLevel, Salesforce, Zoho, Dynamics), otherwise an email address and/or mobile number for alerts.
- **Callback promise:** how soon they call back. Default: "within one business day".
- **Extra fields:** anything beyond the defaults (e.g. budget, job address, how they heard about us).

## What to collect (defaults)
- **Name.**
- **Callback number:** confirm `{{user_number}}` or take another and read it back digit by digit.
- **What it's about:** in the caller's words.
- **Urgency:** routine / soon / urgent.
- **Best time to call back.**
- **For new customers,** also: the service they're interested in, plus location if the business travels.

## Implementation
**Capture.** Always use native post-call analysis: add the fields below to the agent's `post_call_analysis_data`. The platform extracts them after every call, with no tool call needed during the call.

**Delivery.** Take the first option that works:
1. **Native CRM integration** if the client has a CRM. Retell contact sync and CRM tools cover HubSpot, GoHighLevel, Salesforce, Zoho, Dynamics and Zendesk.
   - Connect it with `create-app`, then map the fields with CRM mappings.
   - Also add a CRM note or task tool if they want one per call.
2. **`notify-owner` custom function,** shared at `functions/notify-owner/`:
   - It receives the platform's `call_analyzed` webhook, verifies the signature, dedupes on the call ID, and sends the owner a short message: who, number, what, urgency, and a link to the recording/transcript in the platform dashboard.
   - **Email** goes through a transactional email service. The default is Resend, which has a free tier and needs `RESEND_API_KEY`, an operator step if missing.
   - **Text alerts:** use them only for urgent leads. US clients need A2P-approved SMS (about 2–3 weeks; $20/month plus 1¢ per SMS on Retell). Elsewhere use an SMS provider the operator has a key for. Otherwise email only, flagged "URGENT" in the subject.
   - Deploy once per client with that client's recipients as config (see `build-receptionist` step 5).
   - Never put the transcript itself in an email for medical, legal or financial clients. Send a dashboard link only.
3. **Urgent leads during the call:** if the owner wants an instant alert, use a mid-call tool `alert_owner(summary, callback_number)` on the same Worker, instead of waiting for the post-call webhook.

## Prompt block
```
## Taking a message or a new enquiry
- Collect, one at a time: name; best callback number (confirm the number they're calling from, {{user_number}}, or take another and read it back digit by digit); what it's about; how urgent; best time to reach them.
- Don't interrogate: if they've already said something, don't ask again.
- Read the message back in one sentence before ending: "So, Ada Obi, 0803 123 4567, wants a quote for a kitchen rewire, ideally this week, best after 4 p.m. Is that right?"
- Promise only this callback time: "<owner's answer>". Never promise a specific person or a specific time.
```

## Post-call fields
`caller_name`, `callback_number`, `reason`, `urgency` (enum: routine, soon, urgent), `best_callback_time`, `new_customer` (boolean), `service_interest`, `message_taken` (boolean).

## Test cases
1. Full message: collects every field, reads it back, gives the right callback promise. (Must pass.)
2. Caller gives everything in one breath: doesn't re-ask what was already said.
3. Caller wants a different callback number: reads the new number back digit by digit. (Must pass.)
4. Urgent issue: urgency is marked urgent, and the mid-call alert fires if configured.
5. Caller refuses to give a name: takes the message anyway with the number only.
6. Webhook check (outside simulation): replay a sample `call_analyzed` payload to the Worker. The owner gets exactly one message, and an unsigned request gets 401.
