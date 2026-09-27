import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MODULE_ID, terminalPages, escapeHTML, validateJournal } from "../scripts/model.js";

const player = { isGM: false };
const gm = { isGM: true };
const page = (id, { sort = 0, readable = true, hidden = false, type = "text" } = {}) => ({
  id, uuid: `JournalEntry.j.JournalEntryPage.${id}`, name: id, type, sort,
  text: { content: `<p>${id}</p>` }, testUserPermission: () => readable,
  getFlag: () => hidden
});
const journal = (pages, readable = true) => ({
  id: "j", uuid: "JournalEntry.j", documentName: "JournalEntry", name: "Records", pages,
  testUserPermission: () => readable
});

test("player directory omits private, hidden and non-text pages and preserves journal order", () => {
  const j = journal([page("later", { sort: 20 }), page("private", { readable: false }),
    page("hidden", { hidden: true }), page("image", { type: "image" }), page("first", { sort: 10 })]);
  assert.deepEqual(terminalPages(j, player).map(p => p.id), ["first", "later"]);
  assert.equal(terminalPages(j, gm).length, 4);
});

test("readable pages never bypass a private parent journal", () => {
  assert.deepEqual(terminalPages(journal([page("secret")], false), player), []);
  assert.deepEqual(terminalPages(null, player), []);
});

test("journal names are escaped in setup options", () => {
  assert.equal(escapeHTML('<script a="x">&\'</script>'), "&lt;script a=&quot;x&quot;&gt;&amp;&#39;&lt;/script&gt;");
});

test("binding requires a world journal", () => {
  assert.throws(() => validateJournal(null));
  assert.throws(() => validateJournal({ documentName: "Actor" }));
  assert.throws(() => validateJournal({ documentName: "JournalEntry", pack: "world.pack" }));
  assert.equal(validateJournal(journal([])).id, "j");
});

const hooks = new Map();
globalThis.Hooks = {
  once: (name, fn) => hooks.set(name, fn),
  on: (name, fn) => hooks.set(name, fn)
};
class FakeApplication {
  constructor() { this.element = { querySelector: () => null }; }
  async _prepareContext() { return {}; }
  async render() { this.context = await this._prepareContext(); this.rendered = true; return this; }
  bringToFront() {}
  close() { this.rendered = false; }
}
let enrichOptions;
globalThis.foundry = { applications: {
  api: { ApplicationV2: FakeApplication, HandlebarsApplicationMixin: base => base },
  ux: { TextEditor: { enrichHTML: async (html, options) => { enrichOptions = options; return html; } } }
} };
let currentJournal = journal([page("a"), page("b")]);
foundry.utils = {
  fromUuid: async () => currentJournal,
  fromUuidSync: () => currentJournal
};
globalThis.game = { user: gm, keybindings: { register() {} }, modules: new Map([[MODULE_ID, {}]]) };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { HOVER: 20 }, DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
let created;
const scene = {
  id: "scene", tokens: new Map(),
  async createEmbeddedDocuments(type, data) { created = { type, data }; return data; }
};
globalThis.canvas = { ready: true, scene, grid: { size: 100 }, stage: { pivot: { x: 500, y: 400 } } };
globalThis.CONFIG = { Token: { objectClass: class {
  _canView() { return "original view"; }
  _canControl() { return "original control"; }
  _canDrag() { return "original drag"; }
  _onClickLeft2() { return "original double click"; }
} } };

const api = await import("../scripts/main.js");
const { TerminalApplication } = await import("../scripts/terminal.js");
function token() {
  const doc = { id: "t", uuid: "Scene.scene.Token.t", documentName: "Token", parent: scene,
    name: "Terminal", hidden: false, object: { isVisible: true },
    getFlag: () => currentJournal.uuid,
    async setFlag(scope, key, value) { this.savedFlag = { scope, key, value }; }
  };
  scene.tokens.set(doc.id, doc);
  return doc;
}

test("GM creates an actorless token with persistent source and explicit coordinates", async () => {
  await api.createTerminal({ journalUuid: currentJournal.uuid, x: 0, y: 200, name: "Test" });
  assert.equal(created.type, "Token");
  const data = created.data[0];
  assert.equal(data.actorId, null);
  assert.equal(data.x, 0);
  assert.equal(data.y, 200);
  assert.equal(data.flags[MODULE_ID].journalUuid, currentJournal.uuid);
  assert.equal(data.sight.enabled, false);
  await assert.rejects(api.createTerminal({ journalUuid: currentJournal.uuid, x: NaN }));
});

test("players cannot place or relink terminals", async () => {
  game.user = player;
  await assert.rejects(api.createTerminal({ journalUuid: currentJournal.uuid }), /Only the GM/);
  await assert.rejects(api.bindTerminal(token(), currentJournal.uuid), /Only the GM/);
  game.user = gm;
});

test("relinking writes the journal flag on the token document", async () => {
  const doc = token();
  await api.bindTerminal({ document: doc }, currentJournal.uuid);
  assert.deepEqual(doc.savedFlag, { scope: MODULE_ID, key: "journalUuid", value: currentJournal.uuid });
});

test("player content respects page removal, secrets filtering and permission revocation", async () => {
  game.user = player;
  const app = new TerminalApplication(token());
  app.pageId = "a";
  let context = await app._prepareContext();
  assert.equal(context.selected, "a");
  assert.equal(enrichOptions.secrets, false);
  currentJournal.pages = [page("b")];
  context = await app._prepareContext();
  assert.equal(context.selected, undefined);
  assert.equal(app.pageId, null);
  currentJournal.testUserPermission = () => false;
  context = await app._prepareContext();
  assert.equal(context.unavailable, true);
  assert.equal(context.content, undefined);
  currentJournal = journal([page("a"), page("b")]);
  game.user = gm;
});

test("hidden, unseen and deleted tokens deny player opening", async () => {
  game.user = player;
  const doc = token();
  doc.hidden = true;
  await assert.rejects(api.openTerminal(doc), /unavailable/);
  doc.hidden = false;
  doc.object.isVisible = false;
  await assert.rejects(api.openTerminal(doc), /unavailable/);
  doc.object.isVisible = true;
  scene.tokens.delete(doc.id);
  await assert.rejects(api.openTerminal(doc), /unavailable/);
  game.user = gm;
});

test("token integration delegates ordinary tokens and denies player dragging of terminals", () => {
  hooks.get("init")();
  const ordinary = new CONFIG.Token.objectClass();
  ordinary.document = { getFlag: () => undefined };
  assert.equal(ordinary._onClickLeft2(), "original double click");
  assert.equal(ordinary._canControl(player), "original control");
  const terminal = new CONFIG.Token.objectClass();
  terminal.document = token();
  terminal.isVisible = true;
  assert.equal(terminal._canView(player), true);
  assert.equal(terminal._canDrag(player), false);
  assert.equal(terminal._canDrag(gm), true);
});

test("journal updates refresh open applications and scene teardown closes them", async () => {
  const app = await api.openTerminal(token());
  assert.equal(app.rendered, true);
  hooks.get("deleteJournalEntryPage")();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.context.count, 2);
  hooks.get("canvasTearDown")();
  assert.equal(app.rendered, false);
});

test("manifest points to existing runtime assets and targets Fallout on v14", () => {
  const manifest = JSON.parse(readFileSync(new URL("../module.json", import.meta.url)));
  assert.equal(manifest.compatibility.minimum, "14");
  assert.equal(manifest.relationships.systems[0].id, "fallout");
  for (const path of [...manifest.esmodules, ...manifest.styles, "templates/terminal.hbs", "assets/terminal.svg"]) {
    assert.ok(readFileSync(new URL(`../${path}`, import.meta.url)).length);
  }
});
