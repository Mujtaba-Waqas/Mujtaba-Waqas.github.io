/** Small TwiML builders for the live phone modes (text-back, ring-first, voicemail). */
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const doc = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;

export function twimlMissed(message: string, voicemailAction: string | null) {
  return doc(voicemailAction ? `<Say>${esc(message)}</Say><Record action="${esc(voicemailAction)}" method="POST" maxLength="120" playBeep="true" timeout="5"/>` : `<Say>${esc(message)}</Say><Hangup/>`);
}

export function twimlDial(number: string, timeoutSeconds: number, action: string, callerId?: string | null) {
  return doc(`<Dial timeout="${timeoutSeconds}" action="${esc(action)}" method="POST"${callerId ? ` callerId="${esc(callerId)}"` : ""}><Number>${esc(number)}</Number></Dial>`);
}

export function twimlHangup(message?: string) {
  return doc(message ? `<Say>${esc(message)}</Say><Hangup/>` : "<Hangup/>");
}

export function twimlEmpty() {
  return doc("");
}
