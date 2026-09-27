import { MODULE_ID, ICON, escapeHTML, validateJournal } from "./model.js";
import { TerminalApplication } from "./terminal.js";

const windows = new Map();

function requireGM() {
  if (!game.user.isGM) throw new Error("Only the GM can configure terminals.");
}

function requireScene() {
  if (!canvas?.ready || !canvas.scene) throw new Error("Open a scene before placing a terminal.");
  return canvas.scene;
}

function notifyError(error) {
  console.error(`${MODULE_ID} |`, error);
  ui.notifications.error(error.message ?? "Terminal operation failed.");
}

async function resolveJournal(uuid) {
  return validateJournal(await foundry.utils.fromUuid(uuid));
}

/** Place a real, actorless TokenDocument. No Fallout actor schema is modified. */
export async function createTerminal({ journalUuid, name, x, y } = {}) {
  requireGM();
  const scene = requireScene();
  const journal = await resolveJournal(journalUuid);
  const size = canvas.grid.size;
  const center = canvas.stage.pivot;
  const position = {
    x: x ?? Math.round((center.x - size / 2) / size) * size,
    y: y ?? Math.round((center.y - size / 2) / size) * size
  };
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new Error("Terminal coordinates must be finite numbers.");
  }
  const [token] = await scene.createEmbeddedDocuments("Token", [{
    name: name?.trim() || journal.name,
    ...position, width: 1, height: 1, actorId: null,
    texture: { src: ICON }, disposition: 0,
    displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
    sight: { enabled: false },
    flags: { [MODULE_ID]: { journalUuid: journal.uuid } }
  }]);
  ui.notifications.info("Terminal placed. Double-click it to connect; GM can drag it into position.");
  return token;
}

export async function bindTerminal(token, journalUuid) {
  requireGM();
  const document = token?.document ?? token;
  if (document?.documentName !== "Token" || !document.parent) {
    throw new Error("Select a token on the scene first.");
  }
  const journal = await resolveJournal(journalUuid);
  await document.setFlag(MODULE_ID, "journalUuid", journal.uuid);
  return document;
}

export async function openTerminal(token) {
  const document = token?.document ?? token;
  if (!document?.getFlag(MODULE_ID, "journalUuid")) throw new Error("This token is not a terminal.");
  let app = windows.get(document.uuid);
  if (!app) app = new TerminalApplication(document);
  if (!app.accessible) throw new Error("Terminal unavailable. You need Observer access to its journal and sight of its token.");
  app.lastAccess = true;
  windows.set(document.uuid, app);
  await app.render({ force: true });
  app.bringToFront();
  return app;
}

export async function createDemo() {
  requireGM();
  requireScene();
  const journal = await foundry.documents.JournalEntry.create({
    name: "Relay Station — Terminal Records",
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
    pages: [
      { name: "Station status", type: "text", sort: 100000,
        text: { content: "<p>REMOTE RELAY 07 / AUXILIARY POWER</p><p>Reactor output: nominal.<br>External communications: offline.<br>Personnel on site: 0.</p><p>See maintenance log for restoration procedures.</p>", format: 1 } },
      { name: "Maintenance log", type: "text", sort: 200000,
        text: { content: "<p>October 22, 2077</p><p>The replacement fuse is in the supply locker. If the antenna goes dark again, cycle the breaker and reseat the coupler.</p><p>Do not touch the red cable. That means you, Franklin.</p>", format: 1 } },
      { name: "Overseer's message", type: "text", sort: 300000,
        text: { content: "<p>To whoever finds this station:</p><p>We headed north at dawn. There is clean water in the basement and a map behind the wall panel.</p><p>Leave the beacon running. Someone else may need it.</p>", format: 1 } }
    ]
  });
  try {
    const token = await createTerminal({ journalUuid: journal.uuid, name: "Relay Station Terminal" });
    await openTerminal(token);
    return { journal, token };
  } catch (error) {
    ui.notifications.warn(`Demo journal "${journal.name}" was saved. Use setup to place its terminal.`);
    throw error;
  }
}

export async function showSetup() {
  requireGM();
  const journals = game.journal.contents.toSorted((a, b) => a.name.localeCompare(b.name));
  const options = journals.map(j => `<option value="${escapeHTML(j.uuid)}">${escapeHTML(j.name)}</option>`).join("");
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Fallout Terminal Setup" },
    position: { width: 480 },
    content: `<p>Each text page becomes a terminal entry. Reorder or edit pages to update the terminal.</p>
      <div class="form-group"><label>Source journal</label><select name="journalUuid">${options}</select></div>
      <div class="form-group"><label>Terminal name</label><input name="terminalName" placeholder="Use journal name"></div>
      <p>Players need <strong>Observer</strong> access to the journal and its pages. Demo records are shared with all players.</p>
      <p>New terminals appear at the center of your view. To link an existing token, select exactly one before opening setup.</p>`,
    buttons: [
      { action: "create", label: "Place Terminal", icon: "fa-solid fa-terminal", disabled: !journals.length,
        callback: (event, button) => ({ action: "create", journalUuid: button.form.elements.journalUuid.value,
          name: button.form.elements.terminalName.value }) },
      { action: "bind", label: "Link Selected", disabled: !journals.length,
        callback: (event, button) => ({ action: "bind", journalUuid: button.form.elements.journalUuid.value }) },
      { action: "demo", label: "Create Demo", callback: () => ({ action: "demo" }) }
    ],
    rejectClose: false
  });
  if (!result) return;
  if (result.action === "demo") return createDemo();
  if (result.action === "create") return createTerminal(result);
  if (canvas.tokens.controlled.length !== 1) throw new Error("Select exactly one token to link.");
  await bindTerminal(canvas.tokens.controlled[0], result.journalUuid);
  ui.notifications.info("Selected token linked to the journal.");
}

Hooks.once("init", () => {
  // Compose with the system's current Token class; ordinary tokens retain its behavior.
  const BaseToken = CONFIG.Token.objectClass;
  CONFIG.Token.objectClass = class JournalTerminalToken extends BaseToken {
    get isJournalTerminal() { return Boolean(this.document.getFlag(MODULE_ID, "journalUuid")); }
    _canView(user, event) {
      return this.isJournalTerminal ? (user.isGM || (!this.document.hidden && this.isVisible)) : super._canView(user, event);
    }
    _canDrag(user, event) {
      return this.isJournalTerminal ? user.isGM : super._canDrag(user, event);
    }
    _onClickLeft2(event) {
      if (!this.isJournalTerminal) return super._onClickLeft2(event);
      void openTerminal(this).catch(notifyError);
    }
  };

  game.keybindings.register(MODULE_ID, "setup", {
    name: "Open Fallout Terminal Setup", restricted: true,
    editable: [{ key: "KeyT", modifiers: ["SHIFT"] }],
    onDown: () => { void showSetup().catch(notifyError); return true; }
  });
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM || !controls.tokens) return;
  controls.tokens.tools.falloutTerminal = {
    name: "falloutTerminal", title: "Fallout Terminal Setup", icon: "fa-solid fa-terminal",
    order: 90, button: true, onChange: () => void showSetup().catch(notifyError)
  };
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = Object.freeze({
    createTerminal, bindTerminal, openTerminal, createDemo, showSetup
  });
});

function refreshTerminals() {
  for (const app of windows.values()) {
    if (!app.rendered) continue;
    app.lastAccess = Boolean(app.accessible);
    // Immediately discard rendered content on updates, including revoked permissions.
    app.element.querySelector(".ft-screen")?.replaceChildren();
    void app.render({ force: true }).catch(notifyError);
  }
}

for (const hook of ["createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage",
  "updateJournalEntry", "deleteJournalEntry", "updateToken", "deleteToken", "updateUser"
]) Hooks.on(hook, refreshTerminals);

Hooks.on("sightRefresh", () => {
  if ([...windows.values()].some(app => app.rendered && Boolean(app.accessible) !== app.lastAccess)) {
    refreshTerminals();
  }
});

Hooks.on("closeTerminalApplication", app => windows.delete(app.token.uuid));
Hooks.on("canvasTearDown", () => {
  for (const app of windows.values()) void app.close();
  windows.clear();
});
