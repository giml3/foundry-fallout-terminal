export const MODULE_ID = "fallout-terminal";
export const ICON = `modules/${MODULE_ID}/assets/terminal.svg`;

export function canRead(document, user) {
  return Boolean(document && (user.isGM || document.testUserPermission(user, "OBSERVER")));
}

export function terminalPages(journal, user) {
  if (!canRead(journal, user)) return [];
  return Array.from(journal.pages ?? [])
    .filter(page => page.type === "text" && canRead(page, user)
      && (user.isGM || !page.getFlag(MODULE_ID, "hidden")))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id));
}

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

export function validateJournal(journal) {
  if (journal?.documentName !== "JournalEntry" || journal.pack) {
    throw new Error("Choose a world Journal Entry. Import compendium journals first.");
  }
  return journal;
}
