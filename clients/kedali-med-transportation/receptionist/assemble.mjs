// Builds the exact Retell payloads (llm.json, agent.json) from prompt.md and the settings below.
// Usage: node clients/kedali-med-transportation/receptionist/assemble.mjs [--model <model>]
// After editing prompt.md or settings: re-run, then update the LLM/agent with the new JSON.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const modelArg = args.includes("--model") ? args[args.indexOf("--model") + 1] : null;

const MODEL = modelArg || "claude-5.5-haiku"; // pick recorded in build-plan.md / docs/platforms/retell/models.md
const KB_ID = "knowledge_base_6e145103d5837af9";
const TEAM_LINE = "+13098076178"; // ASSUMED: Kedali main line until the owner gives a dispatch/mobile number

const prompt = readFileSync(join(here, "prompt.md"), "utf8").split("<!-- PROMPT -->")[1].trim();

// check_open: from the receptionist-after-hours skill (unit-tested there).
const checkOpenCode = `const hours = JSON.parse(dv.business_hours_json || "{}");
const holidays = JSON.parse(dv.holidays_json || "[]");
const now = dv.current_time;
const hour = Number(dv.current_hour);
const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const today = names.findIndex((n) => now.startsWith(n));
const toH = (t) => { const [h, m] = t.split(":").map(Number); return h + m / 60; };
const isHoliday = holidays.some((h) => new RegExp(\`\\\\b\${h},\`).test(now));
const ranges = isHoliday ? [] : hours[keys[today]] || [];
const open = ranges.some(([a, b]) => hour >= toH(a) && hour < toH(b));
let next = null;
const later = ranges.find(([a]) => toH(a) > hour);
if (later) next = \`today at \${later[0]}\`;
for (let i = 1; !next && i <= 7; i++) {
  const r = hours[keys[(today + i) % 7]] || [];
  if (r.length) next = \`\${i === 1 ? "tomorrow" : names[(today + i) % 7]} at \${r[0][0]}\`;
}
return { open, holiday: isHoliday, next_open: next || "soon" };`;

const llm = {
  model: MODEL,
  model_temperature: 0.2,
  start_speaker: "agent",
  begin_message:
    "Thanks for calling Kedali Medical Transportation. I'm the virtual assistant, and this call is recorded. How can I help you today?",
  general_prompt: prompt,
  general_tools: [
    {
      type: "transfer_call",
      name: "transfer_to_team",
      description:
        "Put the caller through to the Kedali team. Only when office_open is true, for: a rider waiting or a late driver, a rider ready to be picked up, a same-day hospital discharge, a complaint, or a caller who asked twice for a person.",
      transfer_destination: { type: "predefined", number: TEAM_LINE },
      transfer_option: {
        type: "warm_transfer",
        show_transferee_as_caller: true,
        transfer_ring_duration_ms: 25000,
        on_hold_music: "relaxing_sound",
        private_handoff_option: {
          type: "prompt",
          prompt: "In one sentence, tell the Kedali team member who is calling, why, and where the rider is if relevant.",
        },
      },
      speak_during_execution: true,
      execution_message_description: "Tell the caller you're putting them through to the team now.",
      execution_message_type: "prompt",
    },
    {
      type: "end_call",
      name: "end_call",
      description: "End the call after the closing, after telling someone to call 911, or for sales calls and robocalls.",
    },
  ],
  default_dynamic_variables: {
    office_hours_spoken: "Monday to Friday, 9 in the morning to 6 in the evening",
    business_hours_json: JSON.stringify({ mon: [["09:00", "18:00"]], tue: [["09:00", "18:00"]], wed: [["09:00", "18:00"]], thu: [["09:00", "18:00"]], fri: [["09:00", "18:00"]], sat: [], sun: [] }),
    holidays_json: JSON.stringify(["November 26", "December 25", "January 1", "May 31", "July 5", "September 6"]),
    next_open: "on the next business day",
    office_open: "unknown",
  },
  knowledge_base_ids: [KB_ID],
  kb_config: { top_k: 3, filter_score: 0.6 },
};

const s = (name, description) => ({ type: "string", name, description });
const b = (name, description) => ({ type: "boolean", name, description });
const e = (name, description, choices) => ({ type: "enum", name, description, choices });

const agent = {
  agent_name: "Kedali Med Transportation Receptionist",
  voice_id: "retell-Grace",
  language: "en-US",
  timezone: "America/Chicago",
  end_call_after_silence_ms: 30000,
  max_call_duration_ms: 1200000,
  responsiveness: 0.8,
  interruption_sensitivity: 0.8,
  data_storage_setting: "everything_except_pii",
  // Runs before the agent's first word; its outputs become {{office_open}} / {{next_open}}.
  // Deterministic: the LLM can't skip it (it skipped an in-call check_open tool in tests).
  pre_session_tools: [
    {
      type: "code",
      name: "check_open",
      description: "Works out whether the office is open right now and when it next opens.",
      code: checkOpenCode,
      timeout_ms: 5000,
      response_variables: { office_open: "open", next_open: "next_open" },
    },
  ],
  boosted_keywords: ["Kedali", "Normal", "Bloomington", "Peoria", "Champaign", "Springfield", "Urbana", "Pekin", "Decatur", "dialysis", "Medicaid", "ModivCare", "MTM", "McLean", "Tazewell", "Livingston", "LaSalle", "Sangamon", "Logan", "Macon", "Piatt", "Ford", "Cook", "Will", "wheelchair"],
  post_call_analysis_data: [
    b("trip_request", "True if the caller asked to book a new ride."),
    s("rider_name", "Full name of the person riding."),
    s("caller_name", "Name of the caller if different from the rider, with relationship or facility (e.g. 'Mary, daughter' or 'Jo, case manager at OSF')."),
    s("callback_number", "Best callback number the caller confirmed."),
    s("pickup_address", "Pickup address including unit and driver notes."),
    s("destination", "Destination name and address."),
    s("appointment_datetime", "Appointment date and time as stated, plus the actual date."),
    e("trip_type", "Kind of trip requested.", ["one_way", "round_trip_set_time", "round_trip_will_call", "not_applicable"]),
    s("recurring", "Recurring schedule if any (e.g. 'dialysis Mon/Wed/Fri'), else empty."),
    e("mobility", "Rider mobility.", ["walks", "cane_or_walker", "own_wheelchair_manual", "own_wheelchair_power", "scooter", "stretcher_requested", "other", "unknown"]),
    s("companions", "Who rides along, if anyone."),
    e("payer", "How the ride will be paid.", ["medicaid", "private_pay", "facility", "unknown"]),
    s("medicaid_plan", "Health plan name if Medicaid."),
    s("special_needs", "Oxygen, help to the door, stairs, sedation, or other notes."),
    b("urgent", "True for: rider waiting or late driver, ready for pickup, same-day discharge, same-day ride or same-day cancellation, or a complaint about a current ride."),
    e("urgent_reason", "Why it's urgent.", ["none", "rider_waiting", "late_driver", "will_call_ready", "discharge_today", "same_day_ride", "same_day_cancel", "complaint", "other"]),
    e("booking_change", "Change to an existing ride.", ["none", "cancel", "reschedule", "other"]),
    s("change_details", "Details of the change requested."),
    b("message_taken", "True if a message or callback request was taken."),
    s("reason", "One-sentence reason for the call."),
    s("unanswered_question", "Any question the assistant couldn't answer."),
    b("transferred", "True if the call was transferred to the team."),
    b("emergency", "True if the caller was told to call 911."),
  ],
};

writeFileSync(join(here, "llm.json"), JSON.stringify(llm, null, 2));
writeFileSync(join(here, "agent.json"), JSON.stringify(agent, null, 2));
console.log(`Wrote llm.json (model ${MODEL}, prompt ${prompt.length} chars) and agent.json`);
