---
name: receptionist-cancel-reschedule
description: Library module for receptionists that cancel or move existing appointments. Covers finding the booking, checking the caller's identity, applying the cancellation policy, offering a reschedule before a cancel, the prompt block, tool config, post-call fields and test cases. Load it from build-receptionist or business-research when callers can change existing bookings.
---

# Cancel and reschedule

## Owner facts needed
- **Cancellation policy:** the notice period, any fee, and whether the receptionist may waive it. Default: state the policy, never waive.
- **Identity check:** how to confirm the caller owns the booking.
  - Default for most businesses: name plus the phone number on the booking.
  - Default for medical, dental and legal: name plus date of birth or booking email, before saying any appointment details.
- **Retention:** whether to offer a reschedule before cancelling. Default: yes, once.

## Implementation (take the first that works)
1. **Native integration.** Retell's Cal.com tools chain together: List Bookings (by attendee email, within a time window), then Reschedule Booking or Cancel Booking.
   - List Bookings returns the booking UID. Map it to a dynamic variable so the next tool can use it.
   - Check Availability first, so the new time is confirmed open before rescheduling.
2. **Industry software with an API:** use custom functions `find_booking(phone | email | name+dob)`, `reschedule_booking(booking_id, new_slot)` and `cancel_booking(booking_id, reason)`.
3. **No API: request mode.** Collect name, current appointment (as the caller remembers it), the change wanted and preferred new times. Deliver via `receptionist-lead-capture`, and say the team will confirm. Never say it's done.

## Prompt block
```
## Changing or cancelling an appointment
- Find the booking first: ask for the name and <identity check>. Use the number they're calling from ({{user_number}}) if the booking system matches on phone.
- Don't say any appointment details until the identity check matches. If it doesn't match after two tries, offer to take a message for the team.
- Confirm which appointment: "I see your cleaning on Thursday the 23rd at 9 in the morning. Is that the one?"
- If they want to cancel: offer once to move it instead ("Would another day work better?"). If they still want to cancel, cancel. Don't push twice.
- If cancelling within the notice period, tell them the policy plainly: "<policy>". Don't waive or negotiate fees.
- Rescheduling: check availability, offer two times, read back the new time, then move it only after a clear yes. Confirm the old time is released.
- Always end by stating the final state: "You're now booked for ..." or "That appointment is cancelled."
```

## Tool config notes
- Use separate tools for reschedule and cancel. Never let one tool do both.
- Cancel tools: a short `speak_during_execution` line, and `max_retry: 0` (not safe to repeat).

## Post-call fields
`booking_change` (enum: none, rescheduled, cancelled, request_taken), `old_datetime`, `new_datetime`, `late_cancellation` (boolean), `identity_verified` (boolean).

## Test cases
1. Reschedule to an open slot: finds, verifies, moves, confirms the final time. (Must pass.)
2. Cancel: offers a reschedule once, then cancels when the caller insists. (Must pass.)
3. Identity doesn't match: no appointment details are revealed, and it offers a message. (Must pass.)
4. Cancel inside the notice window: states the policy and doesn't waive the fee.
5. Caller has two upcoming bookings: asks which one before changing anything.
6. No booking found: double-checks the spelling and details once, then takes a message.
