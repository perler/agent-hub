const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { importOldState } = require('./lib/migrate');

const {
  asanaAvailable, asanaTaskFor, forgetAsanaAvailable, openAsanaTask, refreshAsanaProjects,
} = require('./lib/asana');
const {
  BookmarksProvider, addBookmark, setBookmarksProvider, editBookmark, ensureBookmarksFile, openBookmark, removeBookmark,
} = require('./lib/bookmarks');
const {
  FavouritesProvider, FavouritesDragAndDrop, addFavouriteFromUri, setFavProvider, getFavs, removeFavourite, setFavs,
} = require('./lib/favourites');
const { currentFolderSearch, goToFolder } = require('./lib/folder-search');
const {
  launchClaude, moveTerminalTabToEnd, newFolderAndStartClaudeFromUri, newScratchSession, redrawDtachSessions, repairTabNames, sweepDtachLogs, resumeClaude, resumeClaudeFromUri, startClaude, startClaudeFromUri, sweepScratchRenames,
} = require('./lib/launch');
const { AskViewProvider } = require('./lib/newtask');
const { forgetMailAvailable } = require('./lib/mail');
const { providers } = require('./lib/providers');
const { sessionTerminals } = require('./lib/session-registry');
const {
  SessionsProvider, setExtCtx, getSessionCwd, hiddenSessions, pinnedSessions, resumeSessionNode, resumeAndCompactNode, setHiddenSessions, setPinnedSessions,
} = require('./lib/sessions');
const { cfg, shortHome } = require('./lib/shared');
const { startTabLabelWatcher } = require('./lib/tablabels');
const { openUploadPanel } = require('./lib/upload');
const {
  createTabStateProvider, startTabStateWatcher, tabStateSeedTerminals, tabStateSweepStale, tabStateTerminalClosed, tabStateTerminalFocused, tabStateTerminalOpened,
} = require('./lib/tabstate');
const { getTerminalCwd, terminalAsanaTask, terminalFromTabArg } = require('./lib/terminals');
let favProvider;
let bookmarksProvider;
let sessProvider; // module-level so launchClaude can nudge Recent Sessions after a launch

// A favourite already is { path, label }; a Recent Sessions row is turned into one
// from the folder its session ran in.
function folderOf(arg) {
  if (!arg || arg.kind !== 'session') return arg;
  const cwd = getSessionCwd(arg.session);
  if (!cwd) { vscode.window.showWarningMessage('Unknown project folder for this session.'); return null; }
  return { path: cwd, label: path.basename(cwd) };
}

async function applyFastHoverOnce(context) {
  const FLAG = 'agentHub.fastHoverApplied';
  if (context.globalState.get(FLAG)) return;
  try {
    const hoverCfg = vscode.workspace.getConfiguration('workbench.hover');
    const current = hoverCfg.inspect('delay');
    const globalVal = current && current.globalValue;
    if (globalVal === undefined || globalVal > 100) {
      await hoverCfg.update('delay', 100, vscode.ConfigurationTarget.Global);
    }
    await context.globalState.update(FLAG, true);
  } catch (e) {
    // ignore; user can still set it manually
  }
}

// What this workstation actually has. The extension runs on a client's machine too,
// where there is no Asana CLI and no bridge, and everything that talks to either has
// to be gone there rather than present and dead.
function publishAvailability() {
  const asana = asanaAvailable();
  vscode.commands.executeCommand('setContext', 'agentHub.asanaAvailable', asana);
  return asana;
}

function activate(context) {
  setExtCtx(context);
  publishAvailability();
  applyFastHoverOnce(context);
  vscode.commands.executeCommand('setContext', 'agentHub.hasHiddenSessions', hiddenSessions().size > 0);

  // Tab state decorations — see the "tab state decorations" section above.
  tabStateSeedTerminals();
  const tabStateProvider = createTabStateProvider();
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(tabStateProvider));
  context.subscriptions.push(
    vscode.window.onDidOpenTerminal((t) => tabStateTerminalOpened(t)),
    vscode.window.onDidCloseTerminal((t) => tabStateTerminalClosed(t)),
    vscode.window.onDidChangeActiveTerminal((t) => tabStateTerminalFocused(t))
  );
  startTabStateWatcher(context);
  setTimeout(tabStateSweepStale, 5000);
  // Watches ~/.cache/claude-code-helper/tab-labels/ for a shell script relabelling
  // a live tab from outside the extension entirely — see lib/tablabels.js and
  // readme.md "External tab labels".
  startTabLabelWatcher(context);
  // A window reload hands every restored terminal back with only the first word of
  // its name (see repairTabNames). Put the recorded names back — repeatedly, because
  // a tab is only identifiable once its shell's pid has been resolved, which lands
  // seconds after activation and later still for a session that is mid-launch.
  for (const ms of [4000, 12000, 30000]) setTimeout(() => { repairTabNames(); }, ms);
  const askProvider = new AskViewProvider();
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(
    'agentHub.ask', askProvider, { webviewOptions: { retainContextWhenHidden: true } }
  ));
  context.subscriptions.push(askProvider);   // disposes the "task waiting" status bar item
  refreshAsanaProjects(12);   // warm the New Task routing table; never blocks a submit

  favProvider = new FavouritesProvider(context);
  setFavProvider(favProvider);
  const favView = vscode.window.createTreeView('agentHub.favourites', {
    treeDataProvider: favProvider, showCollapseAll: false,
    dragAndDropController: new FavouritesDragAndDrop(context), canSelectMany: false,
  });
  context.subscriptions.push(favView);

  sessProvider = new SessionsProvider();
  const sessView = vscode.window.createTreeView('agentHub.sessions', {
    treeDataProvider: sessProvider, showCollapseAll: true,
  });
  sessProvider.view = sessView;
  providers.sess = sessProvider;
  context.subscriptions.push(sessView);

  bookmarksProvider = new BookmarksProvider();
  setBookmarksProvider(bookmarksProvider);
  const bookmarksView = vscode.window.createTreeView('agentHub.bookmarks', {
    treeDataProvider: bookmarksProvider, showCollapseAll: false,
  });
  context.subscriptions.push(bookmarksView);

  const reg = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  reg('agentHub.refreshQueueCounts', () => askProvider.refreshCounts());
  reg('agentHub.focusNewTask', () => vscode.commands.executeCommand('agentHub.ask.focus'));
  reg('agentHub.showHelp', () => vscode.commands.executeCommand(
    'markdown.showPreview', vscode.Uri.file(path.join(context.extensionPath, 'HELP.md'))));

  // favourites commands
  reg('agentHub.refreshFavourites', () => favProvider.refresh());
  reg('agentHub.addFavourite', async () => {
    const picks = await vscode.window.showOpenDialog({
      canSelectFiles: false, canSelectFolders: true, canSelectMany: true,
      openLabel: 'Add to Claude Favourites',
      defaultUri: vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri,
    });
    if (!picks) return;
    for (const uri of picks) await addFavouriteFromUri(context, uri, { askLabel: picks.length === 1 });
  });
  reg('agentHub.addFromExplorer', (uri) => addFavouriteFromUri(context, uri));
  reg('agentHub.goToFolder', () => goToFolder(context));
  reg('agentHub.folderSearchNewSubfolder', () => {
    const open = currentFolderSearch();
    if (open && open.dir) open.run('newFolder', open.dir);
  });
  reg('agentHub.newSession', () => newScratchSession());
  reg('agentHub.quickSession', () => newScratchSession({ quick: true }));
  reg('agentHub.uploadToToday', () => openUploadPanel());
  reg('agentHub.resumeClaude', (fav) => resumeClaude(fav));
  reg('agentHub.startClaudeFromExplorer', (uri) => startClaudeFromUri(uri));
  reg('agentHub.newFolderAndStartClaudeFromExplorer', (uri) => newFolderAndStartClaudeFromUri(uri));
  reg('agentHub.resumeClaudeFromExplorer', (uri) => resumeClaudeFromUri(uri));
  // The folder actions are shared by Favourites and Recent Sessions; folderOf turns
  // either row into the { path, label } they act on.
  const folderAction = (fn) => (arg) => { const f = folderOf(arg); if (f) fn(f); };
  reg('agentHub.startClaude', folderAction(startClaude));
  reg('agentHub.openTerminalHere', folderAction((f) => {
    const t = vscode.window.createTerminal({ name: f.label || path.basename(f.path), cwd: f.path });
    t.show();
    moveTerminalTabToEnd(t);
  }));
  reg('agentHub.revealInExplorer', folderAction((f) =>
    vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(f.path))));
  reg('agentHub.copyPath', folderAction((f) => {
    vscode.env.clipboard.writeText(f.path);
    vscode.window.setStatusBarMessage(`Copied: ${f.path}`, 2000);
  }));
  reg('agentHub.renameFavourite', async (fav) => {
    if (!fav) return;
    const value = await vscode.window.showInputBox({
      prompt: 'New display name (empty to use folder name)',
      value: fav.label || path.basename(fav.path),
    });
    if (value === undefined) return;
    const favs = getFavs(context);
    const target = favs.find((f) => f.id === fav.id);
    if (!target) return;
    const folderName = path.basename(target.path);
    target.label = !value.trim() || value.trim() === folderName ? undefined : value.trim();
    await setFavs(context, favs);
    favProvider.refresh();
  });
  reg('agentHub.removeFavourite', (fav) => removeFavourite(fav, false));

  // session commands
  reg('agentHub.refreshSessions', () => sessProvider.refresh());
  reg('agentHub.searchSessions', () => {
    const box = vscode.window.createInputBox();
    box.title = 'Search Recent Sessions';
    box.placeholder = 'Filter by anything in the tooltip: name, prompt, last reply, folder, id…';
    box.value = sessProvider.filter;
    box.onDidChangeValue((v) => sessProvider.setFilter(v));
    box.onDidAccept(() => box.hide());
    box.onDidHide(() => box.dispose());
    box.show();
  });
  reg('agentHub.clearSessionSearch', () => sessProvider.setFilter(''));
  reg('agentHub.resumeSession', (node) => resumeSessionNode(node));
  reg('agentHub.resumeAndCompact', (node) => resumeAndCompactNode(node));
  const setPinned = async (node, on) => {
    if (!node || node.kind !== 'session') return;
    const pinned = pinnedSessions();
    if (on) pinned.add(node.session.id); else pinned.delete(node.session.id);
    await setPinnedSessions(pinned);
    sessProvider.refresh();
  };
  reg('agentHub.pinSession', (node) => setPinned(node, true));
  reg('agentHub.unpinSession', (node) => setPinned(node, false));
  reg('agentHub.hideSession', async (node) => {
    if (!node || node.kind !== 'session') return;
    const s = node.session;
    const hidden = hiddenSessions();
    hidden.add(s.id);
    await setHiddenSessions(hidden);
    sessProvider.refresh();
    const pick = await vscode.window.showInformationMessage(`Hidden: ${s.title || s.id}`, 'Undo');
    if (pick !== 'Undo') return;
    const back = hiddenSessions();
    back.delete(s.id);
    await setHiddenSessions(back);
    sessProvider.refresh();
  });
  reg('agentHub.showHiddenSessions', async () => {
    const n = hiddenSessions().size;
    if (!n) { vscode.window.showInformationMessage('No hidden sessions.'); return; }
    await setHiddenSessions(new Set());
    sessProvider.refresh();
    vscode.window.showInformationMessage(`Restored ${n} hidden session${n === 1 ? '' : 's'}.`);
  });
  reg('agentHub.deleteSession', async (node) => {
    if (!node || node.kind !== 'session') return;
    const s = node.session;
    const pick = await vscode.window.showWarningMessage(
      `Delete session “${s.title || s.id}”?`,
      { modal: true, detail: `Permanently removes ${s.file}\n\nThe session can never be resumed again.` },
      'Delete',
    );
    if (pick !== 'Delete') return;
    try { fs.unlinkSync(s.file); }
    catch (e) { vscode.window.showErrorMessage(`Agent Hub: delete failed — ${e.message}`); return; }
    const hidden = hiddenSessions();
    if (hidden.delete(s.id)) await setHiddenSessions(hidden);
    sessProvider.refresh();
    vscode.window.setStatusBarMessage(`Deleted session ${s.id}`, 3000);
  });
  reg('agentHub.copySessionId', (node) => {
    if (!node || node.kind !== 'session') return;
    vscode.env.clipboard.writeText(node.session.id);
    vscode.window.setStatusBarMessage(`Copied session id: ${node.session.id}`, 2000);
  });
  reg('agentHub.copySessionPath', (node) => {
    if (!node || node.kind !== 'session') return;
    vscode.env.clipboard.writeText(node.session.file);
    vscode.window.setStatusBarMessage(`Copied: ${node.session.file}`, 2000);
  });
  reg('agentHub.revealSessionFile', (node) => {
    if (!node || node.kind !== 'session') return;
    vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(node.session.file));
  });

  // Same link from Recent Sessions. It re-resolves at click time instead of trusting
  // the render-time node: the index moves on (a session ends, a terminal gets reused
  // for another task) while the tree sits there.
  reg('agentHub.openSessionTask', (node) => {
    if (!node || node.kind !== 'session') return;
    openAsanaTask(asanaTaskFor(node.session.id, node.session.cwd) || node.session.asana);
  });

  // bookmarks commands
  reg('agentHub.refreshBookmarks', () => bookmarksProvider.refresh());
  reg('agentHub.addBookmark', () => addBookmark());
  reg('agentHub.editBookmark', (bm) => editBookmark(bm));
  reg('agentHub.removeBookmark', (bm) => removeBookmark(bm));
  reg('agentHub.openBookmark', (bm) => openBookmark(bm));
  reg('agentHub.openBookmarksFile', async () => {
    const file = ensureBookmarksFile();
    await vscode.window.showTextDocument(vscode.Uri.file(file));
  });

  // Right-click on a session's own editor tab. See terminalFromTabArg for how the
  // menu's arguments turn back into a terminal; when they can't pin down exactly one,
  // it asks rather than acting on some other session.
  const pickTabTerminal = async (arg, ctx) => {
    const t = terminalFromTabArg(arg, ctx);
    if (!Array.isArray(t)) {
      if (!t) vscode.window.showInformationMessage('No session behind that tab.');
      return t;
    }
    const pick = await vscode.window.showQuickPick(
      t.map((term) => {
        const c = getTerminalCwd(term);
        return { label: term.name, description: c ? shortHome(c.fsPath) : 'no cwd', terminal: term };
      }),
      { placeHolder: 'Which session?' }
    );
    return pick && pick.terminal;
  };

  reg('agentHub.revealTabCwd', async (arg, ctx) => {
    const t = await pickTabTerminal(arg, ctx);
    if (!t) return;
    const cwd = getTerminalCwd(t);
    if (!cwd) { vscode.window.showInformationMessage('No working directory available.'); return; }
    vscode.commands.executeCommand('revealInExplorer', cwd);
  });

  // Same link off the tab, re-resolved at click time for the same reason.
  reg('agentHub.openTabTask', async (arg, ctx) => {
    const t = await pickTabTerminal(arg, ctx);
    if (!t) return;
    const task = terminalAsanaTask(t, getTerminalCwd(t));
    if (!task) { vscode.window.showInformationMessage(`No Asana task recorded for "${t.name}".`); return; }
    openAsanaTask(task);
  });


  reg('agentHub.revealActiveTerminalCwd', () => {
    const t = vscode.window.activeTerminal;
    if (!t) { vscode.window.showInformationMessage('No active terminal.'); return; }
    const cwd = getTerminalCwd(t);
    if (!cwd) { vscode.window.showInformationMessage('No working directory available.'); return; }
    vscode.commands.executeCommand('revealInExplorer', cwd);
  });

  context.subscriptions.push(
    // Closing a session's attach terminal doesn't end the session (the dtach
    // master keeps Claude alive) — drop the map entry and refresh Recent
    // Sessions so the row reappears there as 🟢 running.
    vscode.window.onDidCloseTerminal((t) => {
      for (const [id, term] of sessionTerminals) if (term === t) sessionTerminals.delete(id);
      if (sessProvider) { try { sessProvider.refresh(); } catch {} }
      // Its claude process may take a moment to exit; sweep shortly after so an
      // ended scratch session's folder gets renamed without waiting for the 60s tick.
      setTimeout(() => { try { sweepScratchRenames(); } catch {} }, 4000);
    }),
    // Window regained focus (fires on browser/notebook reconnect): force live dtach
    // sessions to repaint so a reconnected Claude TUI isn't left frozen on a stale frame.
    vscode.window.onDidChangeWindowState((s) => { if (s.focused) redrawDtachSessions(); }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('agentHub') && !e.affectsConfiguration('claudeHelper')) return;
      forgetAsanaAvailable();
      forgetMailAvailable();
      publishAvailability();
      askProvider.postAsanaState();
      favProvider.refresh(); sessProvider.refresh();
      bookmarksProvider.refresh();
    })
  );

  // Favourites, pinned and hidden sessions from Claude Code Helper (see lib/migrate.js).
  // Tried twice: the old extension writes its export on its own activation, which may
  // land after ours in the same reload.
  for (const ms of [2000, 15000]) {
    setTimeout(async () => {
      try {
        if (await importOldState(context.globalState)) {
          favProvider.refresh(); sessProvider.refresh();
          vscode.commands.executeCommand('setContext', 'agentHub.hasHiddenSessions', hiddenSessions().size > 0);
        }
      } catch (e) { console.error('Agent Hub: importing old state failed', e); }
    }, ms);
  }

  // Sessions: light periodic refresh (every 60s) so relative times and new sessions
  // appear; also sweep for ended date-coded scratch folders to auto-rename them.
  // Scrollback logs of dtach sessions: trim the live ones, delete the dead ones' (launch.js).
  setTimeout(sweepDtachLogs, 5000);
  const logTimer = setInterval(sweepDtachLogs, 5 * 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(logTimer) });
  const sessTimer = setInterval(() => { try { sweepScratchRenames(); } catch {} sessProvider.refresh(); }, 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(sessTimer) });
  // Catch sessions that ended while this window was closed.
  setTimeout(() => { try { sweepScratchRenames(); } catch {} }, 5_000);
}

function deactivate() {}

module.exports = { activate, deactivate };

module.exports = {
  activate, deactivate,
};
