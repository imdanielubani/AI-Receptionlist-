---
name: receptionist-booking
description: Library module for receptionists that book new appointments. Gives the owner facts needed, the implementation ladder (native calendar integration, then Cal.com in front of the client's calendar, then a custom function against industry software, then a booking-request fallback), the prompt block, tool config, post-call fields and test cases. Load it from build-receptionist or business-research when the call flow includes booking.
---

# Booking

## Owner facts needed (feed these into business-research)
- **Calendar:** which system holds the calendar (Google, Outlook, Cal.com, Calendly, or industry software like Dentrix, Jobber or Vagaro). Often visible on their website's "Book now" link, so check before asking.
- **Appointment types:** each type, how long it takes, and who can do it (which staff).
- **Booking rules:** how far ahead people can book, minimum notice, new vs existing customer rules, deposits.
- **Details to collect:** what the business needs from the caller. Defaults: name, phone, reason; plus address for on-site work and insurance for medical/dental.

## Implementation (take the first that works)
1. **Native integration with their booking tool.** Use this if they already use Cal.com or Calendly.
   - Retell's Cal.com tools: Check Availability, Book Appointment, List, Get, Reschedule and Cancel Booking.
   - Connect with `create-app` using the client's Cal.com API key (Settings → Developer → API keys).
   - Add one Check Availability + Book Appointment pair **per event type** (the event-type or link ID comes from Cal.com → Links).
   - Calendly also has native tools; check `capabilities.md` for what they cover.
2. **They only use Google or Outlook Calendar:** put a free Cal.com account in front of it.
   - Cal.com reads their busy times from Google or Outlook and writes bookings back, so path 1 then applies.
   - This needs an operator/owner walkthrough: sign up, connect calendar, set hours, create event types, send the API key.
   - It's still the native path, so no custom code.
3. **Industry software with an API** (e.g. ServiceTitan, Jobber, Open Dental): use custom functions `check_availability(service, date_from, date_to)` and `book_appointment(service, slot_id, name, phone, details)` against their API. Follow `build-receptionist` step 5.
4. **No API or no calendar access: booking-request mode.**
   - Collect everything, then say "the team will confirm your time by text or call within <owner's answer, default: one business day>".
   - Deliver it with `receptionist-lead-capture`.
   - Never pretend it's booked.

## Prompt block
```
## Booking
- First find out what they need done, so you book the right type of appointment. If unsure, ask one clarifying question; never guess the service.
- Ask whether they've been here before.
- Collect: full name, then confirm the number they're calling from ({{user_number}}) is the best one. Collect <extra fields> one at a time.
- If the booking system needs an email, ask for it and spell it back letter by letter.
- Check availability before offering times. Offer two options, not a list: "I have Tuesday the 21st at 10 in the morning, or Wednesday at 2 in the afternoon. Which works better?" Use {{current_calendar}} to say dates correctly.
- Never offer or confirm a time the availability check didn't return.
- Before booking, read back everything: service, day, date, time, name, phone. Book only after a clear yes.
- After booking: confirm it's done, then say what to bring or how to prepare (<owner's answer>).
- If the calendar tool fails or has no fitting times: don't retry more than once. Take their details and preferred times, and tell them the team will confirm.
```

## Tool config notes (Retell)
- Integration tools: set `speak_during_execution` with a short filler ("Let me check what's open").
- Map the returned booking ID or UID into a dynamic variable (`response_variables`), so cancel/reschedule can use it on the same call.
- Booking writes are real, even in tests. Point test runs at a test event type, or delete test bookings afterwards.

## Post-call fields
`appointment_booked` (boolean), `appointment_datetime` (string), `appointment_type` (string), `new_customer` (boolean), `booking_failed_reason` (string, empty if none).

## Test cases (add to `tests.md`)
1. Standard booking for the most common service: books, reads back, confirms. (Must pass.)
2. Caller wants a time that's taken: offers the nearest two alternatives and doesn't book the taken slot.
3. Caller is vague about the service: asks one clarifying question before checking availability.
4. Caller changes the day halfway through: re-checks availability for the new day.
5. Calendar tool fails: takes details and promises a callback, without claiming it's booked. (Must pass.)
6. Caller asks the price mid-booking: answers only with owner-approved prices, then returns to booking.
