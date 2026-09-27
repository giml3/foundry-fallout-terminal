# Fallout Journal Terminals

A Foundry VTT 14 module for Fallout 2d20 (`fallout`). Place a terminal token, double-click it, and browse a green phosphor terminal powered by an ordinary Foundry journal.

## Install and try it

1. In Foundry's **Add-on Modules → Install Module**, paste this manifest URL: `https://github.com/giml3/foundry-fallout-terminal/releases/latest/download/module.json`. For manual installation, extract the ZIP from [Releases](https://github.com/giml3/foundry-fallout-terminal/releases) into your Foundry user data `Data/modules/` directory. The resulting manifest must be at `Data/modules/fallout-terminal/module.json`.
2. Restart Foundry. Use a Foundry 14 world running Fallout 2d20 11.17.0 or newer, and enable **Fallout Journal Terminals** in Manage Modules.
3. Open a scene as GM. Select **Token Controls**, then the **terminal icon**, or press **Shift+T**.
4. Click **Create Demo**. This creates a journal with three records, shares it with players at Observer level, and places a terminal at the center of your view.
5. Drag the token into position as GM. Double-click it to connect. Players use Token Controls and double-click a visible terminal without needing ownership of an actor.

The module has no runtime dependencies or build step. The GitHub release contains both the install manifest and module ZIP. Version 0.1.0 is an initial release with live Foundry testing still pending.

## Use your own journal

Create a journal with **Text** pages. In terminal setup, choose that journal and click **Place Terminal**. To turn an existing token into a terminal, select exactly one token and choose **Link Selected**. Linking preserves the token's artwork and actor, if any; its double-click action opens the terminal.

- The journal is the directory; text page names are menu labels and their rich text is the displayed content.
- Journal page sort order controls menu order. Image, PDF, and video pages are omitted; images embedded inside text pages are supported.
- Create, edit, reorder, or delete pages while a terminal is open: it refreshes on connected clients through Foundry's document hooks.
- `@UUID[JournalEntry.ID.JournalEntryPage.PAGE_ID]{Label}` links to readable pages in the same journal navigate inside the terminal. Other Foundry links retain their standard behavior.
- Use **Edit Source Journal** inside the terminal to author records as GM.
- Multiple tokens may point to one journal. Each player navigates independently. Terminals and bindings persist in the scene.

Give intended readers **Observer** permission on the journal and relevant pages using Foundry's ownership controls. The module does not automatically share existing journals or send private records through sockets. A missing/deleted journal, hidden token, lost visibility, scene switch, or revoked read permission makes the terminal unavailable. GM users can read all text pages and secret blocks.

The optional page flag `flags.fallout-terminal.hidden` hides a record from the player's terminal menu. **It is a display setting, not a secrecy boundary.** Players with journal permission can still read the page through Foundry. Use page ownership or GM-only secret blocks for confidential material. The terminal itself does not provide hacking rolls, passwords, range checks, door controls, or macro execution from page content.

## Programmatic control

Run these examples as Foundry script macros. Configuration calls require a GM. They reject on error, so callers can catch errors and display their own notifications.

```js
const terminals = game.modules.get("fallout-terminal").api;
await terminals.showSetup();
```

Create a terminal from a world journal (import compendium journals first):

```js
const terminals = game.modules.get("fallout-terminal").api;
const journal = game.journal.getName("Vault Records");
if (!journal) throw new Error("Create a Vault Records journal first.");
const token = await terminals.createTerminal({
  journalUuid: journal.uuid,
  name: "Security Console",
  x: 1200, // Scene pixels; omitted coordinates use the center of the GM's view.
  y: 800
});
await terminals.openTerminal(token);
```

Update the source journal using standard Foundry document APIs:

```js
const journal = game.journal.getName("Vault Records");
const [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [{
  name: "Power status", type: "text", sort: 100000,
  text: { content: "<p>AUXILIARY GENERATOR ONLINE</p>", format: 1 }
}]);
await page.update({ "text.content": "<p>MAIN GENERATOR RESTORED</p>" });
await page.setFlag("fallout-terminal", "hidden", true); // Menu visibility only.
await page.unsetFlag("fallout-terminal", "hidden");
```

Link or unlink an existing token:

```js
const token = canvas.tokens.controlled[0];
if (!token) throw new Error("Select a token first.");
const journal = game.journal.getName("Vault Records");
if (!journal) throw new Error("Create a Vault Records journal first.");
await game.modules.get("fallout-terminal").api.bindTerminal(token, journal.uuid);
// Restore ordinary double-click behavior later:
await token.document.unsetFlag("fallout-terminal", "journalUuid");
```

Public API: `showSetup()`, `createDemo()`, `createTerminal({journalUuid, name?, x?, y?})`, `bindTerminal(tokenOrDocument, journalUuid)`, and `openTerminal(tokenOrDocument)`.

## Validation and compatibility

Run `npm test` and `npm run check` with Node 22 or newer. Tests exercise directory permissions, ordering, binding, token creation, GM restrictions, visibility denial, content revocation, update hooks, and ordinary-token delegation using a mocked Foundry runtime. Package with `python3 scripts/package.py`.

**A live Foundry 14 session has not been tested in this workspace.** The manifest deliberately does not declare a verified version. Before using in a campaign, test the following in a disposable world with both a GM and a player client:

1. Create the demo from Token Controls and open it on both clients.
2. Confirm players can double-click without actor ownership and cannot drag the terminal.
3. Edit, reorder, add and delete pages while both terminal windows are open.
4. Make a page GM-only; verify its title and content disappear for the player. Repeat with journal ownership, hidden tokens and loss of vision.
5. Follow a same-journal page link; close and reopen the terminal; switch scenes and reload the world.
6. Confirm ordinary character tokens still open Fallout sheets, and GM token configuration still works through the usual token HUD.

The module composes with `CONFIG.Token.objectClass` during initialization and uses ApplicationV2. Another module that replaces that class afterward can interfere with terminal double-click behavior. Original SVG artwork is included; no proprietary Fallout art is bundled.

API references: [Foundry 14 Token](https://foundryvtt.com/api/classes/foundry.canvas.placeables.Token.html), [ApplicationV2](https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html), [scene controls](https://foundryvtt.com/api/functions/hookEvents.getSceneControlButtons.html), and [Fallout system releases](https://foundryvtt.com/packages/fallout).

## Publishing a release

Update the version in `module.json` and `package.json` and the versioned `download` URL in `module.json`. Add release notes to `CHANGELOG.md`, then run the tests and packaging command. Push a matching tag such as `v0.1.0`, or run the **Release** workflow manually on `main`. The workflow validates the versions and URLs, tests the code, builds the ZIP, and publishes it with `module.json` and SHA-256 checksums. The stable manifest URL above always resolves to the latest published release.

This is an unofficial community module, not affiliated with or endorsed by Bethesda, Modiphius, or Foundry Gaming.
