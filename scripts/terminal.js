import { MODULE_ID, canRead, terminalPages } from "./model.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TerminalApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["fallout-terminal"],
    window: { title: "Wasteland Terminal", resizable: true },
    position: { width: 780, height: 580 },
    actions: {
      selectPage: TerminalApplication.selectPage,
      home: TerminalApplication.home,
      editJournal: TerminalApplication.editJournal
    }
  };

  static PARTS = { terminal: { template: `modules/${MODULE_ID}/templates/terminal.hbs` } };

  constructor(token, options = {}) {
    super(options);
    this.token = token;
    this.pageId = null;
  }

  get journal() {
    const uuid = this.token.getFlag(MODULE_ID, "journalUuid");
    return uuid ? foundry.utils.fromUuidSync(uuid) : null;
  }

  get accessible() {
    const scene = canvas?.scene;
    return this.token.parent?.id === scene?.id
      && scene.tokens.has(this.token.id)
      && (game.user.isGM || (!this.token.hidden && this.token.object?.isVisible))
      && canRead(this.journal, game.user);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const journal = this.journal;
    if (!this.accessible) {
      return { ...context, name: "CONNECTION LOST", unavailable: true,
        message: "Terminal unavailable or journal access denied." };
    }
    const pages = terminalPages(journal, game.user);
    const selected = pages.find(page => page.id === this.pageId);
    if (!selected) this.pageId = null;
    const content = selected ? await foundry.applications.ux.TextEditor.enrichHTML(
      selected.text.content ?? "", { secrets: game.user.isGM, relativeTo: selected }
    ) : "";
    // Permissions may have changed while enriching asynchronous document links.
    if (!this.accessible || (selected && !terminalPages(this.journal, game.user).some(p => p.id === selected.id))) {
      return { ...context, name: "CONNECTION LOST", unavailable: true,
        message: "Terminal unavailable or journal access denied." };
    }
    return { ...context, name: this.token.name, journalName: journal.name,
      isGM: game.user.isGM, selected: selected?.name, content,
      pages: pages.map(page => ({ id: page.id, name: page.name, active: page.id === this.pageId })),
      count: pages.length };
  }

  static async selectPage(event, target) {
    this.pageId = target.dataset.pageId;
    await this.render({ force: true });
  }

  static async home() {
    this.pageId = null;
    await this.render({ force: true });
  }

  static editJournal() {
    if (game.user.isGM) this.journal?.sheet.render({ force: true });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Same-journal links navigate inside the terminal; other links retain Foundry behavior.
    this.element.querySelector(".ft-content")?.addEventListener("click", event => {
      const link = event.target.closest("a.content-link[data-uuid]");
      if (!link) return;
      const page = terminalPages(this.journal, game.user).find(p => p.uuid === link.dataset.uuid);
      if (!page) return;
      event.preventDefault();
      event.stopPropagation();
      this.pageId = page.id;
      void this.render({ force: true });
    });
  }
}
