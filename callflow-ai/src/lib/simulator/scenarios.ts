export type SimulatedClock = "after_hours" | "business_hours" | "auto";

export interface Scenario {
  id: string;
  title: string;
  description: string;
  callerNumber: string;
  clock: SimulatedClock;
  tags: string[];
  script: string[];
}

/** Scripted caller lines. Users can edit or replace any line in the simulator. */
export const SCENARIOS: Scenario[] = [
  {
    id: "emergency-ac",
    title: "After-hours AC emergency",
    description: "New caller, 92°F inside with a newborn. Expect emergency detection, on-call dispatch, booking, and SMS confirmation.",
    callerNumber: "(801) 555-0142",
    clock: "after_hours",
    tags: ["Emergency", "After hours", "New customer"],
    script: [
      "Hi, my AC stopped working and it is 92 degrees in my home. We have a newborn here.",
      "My name is Jordan Ellis.",
      "Yes, this number is fine.",
      "4185 S Highland Dr, Holladay, UT 84124",
      "The first one works.",
      "No, that's all. Thank you!",
    ],
  },
  {
    id: "furnace-noise",
    title: "Standard repair — furnace noise",
    description: "Business-hours repair request with a time preference. Expect a normal-priority booking.",
    callerNumber: "(801) 555-0163",
    clock: "business_hours",
    tags: ["Repair", "Business hours"],
    script: [
      "Hi, my furnace is making a loud noise when it kicks on.",
      "This is Priya Natarajan.",
      "Yes",
      "2275 E Evergreen Ave, Salt Lake City 84109",
      "Tomorrow morning if possible.",
      "The second option please.",
      "That's it, thanks!",
    ],
  },
  {
    id: "out-of-area",
    title: "Outside the service territory",
    description: "Caller in Ogden (Weber County). Expect a polite decline and a lead marked lost/out-of-area.",
    callerNumber: "(385) 555-0177",
    clock: "auto",
    tags: ["Service area"],
    script: ["My AC isn't cooling very well and I'd like someone to take a look.", "My name is Travis Boone.", "Yep.", "845 W 2nd St, Ogden, UT 84404"],
  },
  {
    id: "price-question",
    title: "Price question",
    description: "Caller asks about cost. Expect an answer grounded in the knowledge base — never an invented price.",
    callerNumber: "(801) 555-0188",
    clock: "business_hours",
    tags: ["Pricing", "Knowledge base"],
    script: [
      "How much do you charge to come out and look at a furnace that won't turn on?",
      "Okay, that's fair. My name is Ben Carter.",
      "Yes that's my cell.",
      "915 N 400 E, Bountiful, UT 84010",
      "Friday afternoon would be best.",
      "First one.",
      "No, that's everything.",
    ],
  },
  {
    id: "existing-customer",
    title: "Existing customer scheduling",
    description: "Caller ID matches a maintenance-plan customer. Expect recognition, address confirmation, and a booking.",
    callerNumber: "(801) 555-0117",
    clock: "business_hours",
    tags: ["Existing customer", "Maintenance"],
    script: ["Hi, I'd like to schedule my fall furnace tune-up.", "Yes, same address.", "Next Tuesday morning works.", "The first one.", "That's all, thanks."],
  },
  {
    id: "human-transfer",
    title: "Human transfer request",
    description: "Existing customer with a pending estimate asks for a person. Expect a warm transfer to the dispatcher.",
    callerNumber: "(801) 555-0124",
    clock: "business_hours",
    tags: ["Transfer", "Estimate"],
    script: ["I got a quote from you guys last week and I have a few questions. Can I speak to a real person?"],
  },
];

export function getScenario(id: string) {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}
