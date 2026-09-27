/** Static reference data for the Summit Peak HVAC demo tenant. */
import type { KnowledgeCategory } from "@prisma/client";

export const SERVICE_AREAS: { zip: string; city: string; county: string }[] = [
  ...[
    ["84101", "Salt Lake City"], ["84102", "Salt Lake City"], ["84103", "Salt Lake City"], ["84104", "Salt Lake City"], ["84105", "Salt Lake City"],
    ["84106", "South Salt Lake"], ["84107", "Murray"], ["84108", "Salt Lake City"], ["84109", "Salt Lake City"], ["84111", "Salt Lake City"],
    ["84115", "South Salt Lake"], ["84116", "Salt Lake City"], ["84117", "Holladay"], ["84118", "Kearns"], ["84119", "West Valley City"],
    ["84120", "West Valley City"], ["84121", "Cottonwood Heights"], ["84123", "Taylorsville"], ["84124", "Holladay"], ["84047", "Midvale"],
    ["84070", "Sandy"], ["84092", "Sandy"], ["84093", "Sandy"], ["84094", "Sandy"], ["84084", "West Jordan"], ["84088", "West Jordan"],
    ["84095", "South Jordan"], ["84009", "South Jordan"], ["84065", "Riverton"], ["84096", "Herriman"], ["84020", "Draper"], ["84044", "Magna"],
  ].map(([zip, city]) => ({ zip, city, county: "Salt Lake" })),
  ...[
    ["84010", "Bountiful"], ["84011", "Bountiful"], ["84014", "Centerville"], ["84025", "Farmington"], ["84037", "Kaysville"], ["84040", "Layton"],
    ["84041", "Layton"], ["84015", "Clearfield"], ["84075", "Syracuse"], ["84087", "Woods Cross"], ["84054", "North Salt Lake"],
  ].map(([zip, city]) => ({ zip, city, county: "Davis" })),
  ...[
    ["84003", "American Fork"], ["84004", "Alpine"], ["84043", "Lehi"], ["84045", "Saratoga Springs"], ["84042", "Lindon"], ["84057", "Orem"],
    ["84058", "Orem"], ["84097", "Orem"], ["84062", "Pleasant Grove"], ["84601", "Provo"], ["84604", "Provo"], ["84606", "Provo"],
    ["84660", "Spanish Fork"], ["84663", "Springville"], ["84005", "Eagle Mountain"],
  ].map(([zip, city]) => ({ zip, city, county: "Utah" })),
];

export const SERVICES = [
  { category: "ac_repair", name: "AC Repair", durationMinutes: 90, startingPriceCents: null, description: "Diagnosis and repair of central air conditioners and heat pumps." },
  { category: "ac_install", name: "AC Installation", durationMinutes: 120, startingPriceCents: null, description: "Replacement and new installation of AC systems. Free in-home estimate." },
  { category: "furnace_repair", name: "Furnace Repair", durationMinutes: 90, startingPriceCents: null, description: "Gas and electric furnace diagnosis and repair." },
  { category: "furnace_install", name: "Furnace Installation", durationMinutes: 120, startingPriceCents: null, description: "High-efficiency furnace replacement. Free in-home estimate." },
  { category: "maintenance", name: "Maintenance Plan Tune-Up", durationMinutes: 60, startingPriceCents: 14_900, description: "21-point seasonal tune-up. Included twice a year with the Comfort Club plan." },
  { category: "iaq", name: "Indoor Air Quality", durationMinutes: 60, startingPriceCents: null, description: "Filtration, humidifiers, UV lights and air purifiers." },
  { category: "general", name: "HVAC Diagnostic", durationMinutes: 60, startingPriceCents: 8_900, description: "Standard diagnostic visit." },
  { category: "emergency", name: "Emergency HVAC Service", durationMinutes: 120, startingPriceCents: null, description: "24/7 emergency dispatch.", isEmergency: true },
] as const;

export const KNOWLEDGE: { category: KnowledgeCategory; title: string; content: string; tags: string[] }[] = [
  {
    category: "COMPANY",
    title: "About Summit Peak HVAC",
    content:
      "Summit Peak HVAC is a family-owned heating and cooling company based in Salt Lake City, Utah, owned by Olivia Chen. Our licensed technicians service homes across Salt Lake, Davis, and Utah counties. Main line: (801) 555-0198.",
    tags: ["about", "company", "owner", "licensed", "phone"],
  },
  {
    category: "SERVICES",
    title: "Services we offer",
    content:
      "We provide AC repair, AC installation, furnace repair, furnace installation, maintenance plans, indoor air quality solutions (filtration, humidifiers, UV lights), and 24/7 emergency HVAC service. We service all major brands of central air, heat pumps, and gas furnaces. We do not service commercial rooftop units or boilers.",
    tags: ["services", "repair", "installation", "brands", "heat pump", "boiler"],
  },
  {
    category: "HOURS",
    title: "Business hours",
    content: "Office hours are Monday through Friday, 8:00 AM to 6:00 PM Mountain Time. Emergency service is available 24/7, including weekends and holidays.",
    tags: ["hours", "open", "weekend", "schedule"],
  },
  {
    category: "SERVICE_AREA",
    title: "Service area",
    content:
      "We serve Salt Lake County, Davis County, and Utah County — including Salt Lake City, Sandy, West Jordan, Holladay, Bountiful, Layton, Kaysville, Lehi, Orem, and Provo. We do not currently serve Weber, Summit, Tooele, or Wasatch counties (for example Ogden or Park City).",
    tags: ["service area", "cities", "county", "ogden", "park city"],
  },
  {
    category: "PRICING",
    title: "Diagnostic and service call fee",
    content:
      "Our standard diagnostic visit is $89, and it is applied toward the repair if you approve the work during the same visit. Repair pricing is quoted on site after diagnosis, before any work begins.",
    tags: ["price", "cost", "diagnostic", "service call", "fee", "trip charge", "come out", "look at"],
  },
  {
    category: "EMERGENCY",
    title: "After-hours emergency dispatch",
    content:
      "After-hours emergency visits include a $149 dispatch fee in addition to the diagnostic. Emergency visits are dispatched to the on-call technician, who calls ahead before arriving.",
    tags: ["after-hours-fee", "emergency", "after hours", "dispatch fee", "night"],
  },
  {
    category: "PRICING",
    title: "Maintenance tune-ups and the Comfort Club plan",
    content:
      "A single seasonal tune-up is $149. The Comfort Club maintenance plan is $19 per month and includes two tune-ups per year, 15% off repairs, and priority scheduling.",
    tags: ["maintenance", "tune-up", "plan", "comfort club", "membership", "price"],
  },
  {
    category: "PRICING",
    title: "Replacement and installation estimates",
    content:
      "In-home estimates for new AC or furnace systems are free. System pricing depends on home size, equipment efficiency, and ductwork, so we never quote installation prices over the phone — a comfort advisor provides a written estimate with options.",
    tags: ["installation", "replacement", "new system", "estimate", "quote", "price"],
  },
  {
    category: "FINANCING",
    title: "Financing options",
    content:
      "Financing is available for new system installations through our third-party lending partner, subject to credit approval. Terms and promotional offers vary and are reviewed with you during the in-home estimate.",
    tags: ["financing", "payments", "monthly", "credit", "loan"],
  },
  {
    category: "FAQ",
    title: "What brands do you service?",
    content: "We service and repair all major residential HVAC brands, including Carrier, Trane, Lennox, Goodman, Rheem, and York.",
    tags: ["brands", "carrier", "trane", "lennox", "goodman"],
  },
  {
    category: "FAQ",
    title: "Repair warranty",
    content: "Repairs performed by Summit Peak HVAC include a 1-year parts and labor warranty. Manufacturer warranties on new equipment are registered for you at installation.",
    tags: ["warranty", "guarantee", "parts", "labor"],
  },
  {
    category: "FAQ",
    title: "My AC stopped working — what should I check?",
    content:
      "Before we arrive, check that the thermostat is set to cool, that the breaker for the outdoor unit hasn't tripped, and that the air filter isn't clogged. If the outdoor unit is iced over, turn the system off and let it thaw.",
    tags: ["troubleshooting", "ac not working", "thermostat", "breaker", "filter"],
  },
  {
    category: "FAQ",
    title: "Payment methods",
    content: "We accept all major credit cards, checks, and ACH. Payment is due when the work is completed.",
    tags: ["payment", "credit card", "check"],
  },
  {
    category: "EMERGENCY",
    title: "Emergency policy",
    content:
      "We treat these as emergencies: no cooling with indoor temperatures above 85°F, no heat with indoor temperatures below 55°F, or any system failure in a home with infants, seniors, or medical needs. For a gas odor or carbon monoxide alarm, callers must leave the home and call 911 and the gas utility first; we then dispatch the on-call technician.",
    tags: ["emergency", "gas", "carbon monoxide", "no heat", "no cooling", "policy"],
  },
  {
    category: "ESCALATION",
    title: "Escalation and transfer rules",
    content:
      "During business hours, transfer callers who ask for a person, billing questions, complaints, or commercial work to Marcus Reed (dispatcher). After hours, page the on-call technician for emergencies and flag other requests for a callback at 8:00 AM. Complaints about a completed job go to Olivia Chen.",
    tags: ["transfer", "escalation", "complaint", "billing", "person"],
  },
  {
    category: "PROHIBITED",
    title: "Prohibited statements",
    content:
      "Never guarantee an arrival time or same-day installation. Never quote installation or repair prices that are not in this knowledge base. Never diagnose equipment over the phone. Never disparage competitors. Never offer discounts in exchange for reviews.",
    tags: ["prohibited", "compliance"],
  },
];

export const FIRST_NAMES = [
  "Emily", "James", "Rachel", "Tom", "Kevin", "Sarah", "Ashley", "Brandon", "Megan", "Tyler", "Hannah", "Ryan", "Jessica", "Nathan", "Lauren", "Spencer",
  "Brooke", "McKay", "Kaitlyn", "Jared", "Amanda", "Chase", "Heather", "Logan", "Whitney", "Parker", "Natalie", "Dallin", "Camille", "Trevor", "Alexis",
  "Colton", "Madison", "Bryce", "Chelsea", "Landon", "Grace", "Isaac", "Tessa", "Mason", "Paige", "Ethan", "Ava", "Caleb", "Sione", "Mele",
];
export const LAST_NAMES = [
  "Jensen", "Christensen", "Larsen", "Nielsen", "Anderson", "Peterson", "Olsen", "Young", "Smith", "Johnson", "Nguyen", "Garcia", "Tran", "Martinez",
  "Clark", "Walker", "Allen", "Wright", "Hall", "Rasmussen", "Sorensen", "Thompson", "Bennett", "Price", "Cook", "Morgan", "Reyes", "Kim", "Okafor",
  "Fifita", "Brooks", "Harper", "Foster", "Gray", "Ward", "Madsen", "Bingham", "Pratt",
];
export const STREETS = [
  "E Evergreen Ave", "Highland Dr", "E Vine St", "S Orchard Dr", "W Center St", "N Main St", "E Fort Union Blvd", "E Pages Ln", "S 2300 E",
  "E 3900 S", "W 10400 S", "N 400 E", "E 800 N", "S 700 W", "E Bengal Blvd", "W Crestwood Rd", "E Kensington Ave", "S Redwood Rd",
];
