const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const { buildFavouriteTooltip, cfg, makeId, shortHome } = require('./shared');
const STORE_KEY = 'agentHub.favourites';

function getFavs(ctx) {
  return ctx.globalState.get(STORE_KEY, []);
}

async function setFavs(ctx, list) {
  await ctx.globalState.update(STORE_KEY, list);
}

async function checkFavExists(fav) {
  if (!fs.existsSync(fav.path)) {
    const choice = await vscode.window.showWarningMessage(
      `Path no longer exists:\n${fav.path}`,
      'Remove from Favourites',
      'Dismiss'
    );
    if (choice === 'Remove from Favourites') await removeFavourite(fav, true);
    return false;
  }
  return true;
}

let favProvider;
function setFavProvider(p) { favProvider = p; }

async function addFavouriteFromUri(ctx, uri, opts = {}) {
  const p = uri && uri.fsPath;
  if (!p) return;
  try {
    if (!fs.statSync(p).isDirectory()) {
      vscode.window.showWarningMessage('Agent Hub: please pick a directory.');
      return;
    }
  } catch {
    vscode.window.showWarningMessage(`Path does not exist: ${p}`);
    return;
  }
  const favs = getFavs(ctx);
  if (favs.find((f) => f.path === p)) {
    vscode.window.showInformationMessage('Already in favourites.');
    return;
  }
  let label;
  if (opts.askLabel !== false) {
    label = await vscode.window.showInputBox({
      prompt: 'Display name (leave empty to use folder name)',
      value: path.basename(p),
    });
    if (label === undefined) return;
    if (!label.trim() || label.trim() === path.basename(p)) label = undefined;
  }
  favs.push({ id: makeId(), path: p, label });
  await setFavs(ctx, favs);
  favProvider.refresh();
}

async function removeFavourite(fav, skipConfirm) {
  if (!fav) return;
  if (!skipConfirm && cfg().get('confirmRemove')) {
    const name = fav.label || path.basename(fav.path);
    const c = await vscode.window.showWarningMessage(
      `Remove "${name}" from Claude Favourites?`, { modal: true }, 'Remove'
    );
    if (c !== 'Remove') return;
  }
  const favs = getFavs(favProvider.ctx).filter((f) => f.id !== fav.id);
  await setFavs(favProvider.ctx, favs);
  favProvider.refresh();
}

class FavouritesProvider {
  constructor(ctx) {
    this.ctx = ctx;
    this._em = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._em.event;
  }
  refresh() { this._em.fire(); }
  getTreeItem(fav) {
    const name = fav.label || path.basename(fav.path) || fav.path;
    const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.None);
    item.description = shortHome(fav.path);
    item.tooltip = buildFavouriteTooltip(fav);
    item.contextValue = 'favourite';
    item.resourceUri = vscode.Uri.file(fav.path);
    item.iconPath = new vscode.ThemeIcon('folder');
    item.command = { command: 'agentHub.resumeClaude', title: 'Resume Session', arguments: [fav] };
    return item;
  }
  getChildren() { return getFavs(this.ctx); }
}

// Favourites are reordered by dragging one onto another (Pat, 2026-11-18: instead of
// Move Up / Move Down). The dragged row takes the target's place: dragged down it lands
// after the target, dragged up before it; dropped on empty space it goes last.
const FAV_MIME = 'application/vnd.code.tree.agenthub.favourites';

function reorderFavs(favs, ids, targetId) {
  const moving = favs.filter((f) => ids.includes(f.id));
  if (!moving.length || ids.includes(targetId)) return null;
  const from = favs.findIndex((f) => f.id === moving[0].id);
  const rest = favs.filter((f) => !ids.includes(f.id));
  let at = rest.length;
  if (targetId) {
    const t = rest.findIndex((f) => f.id === targetId);
    if (t < 0) return null;
    at = favs.findIndex((f) => f.id === targetId) > from ? t + 1 : t;
  }
  rest.splice(at, 0, ...moving);
  return rest;
}

class FavouritesDragAndDrop {
  constructor(ctx) {
    this.ctx = ctx;
    this.dragMimeTypes = [FAV_MIME];
    this.dropMimeTypes = [FAV_MIME];
  }
  handleDrag(source, dataTransfer) {
    dataTransfer.set(FAV_MIME, new vscode.DataTransferItem(source.map((f) => f.id)));
  }
  async handleDrop(target, dataTransfer) {
    const item = dataTransfer.get(FAV_MIME);
    if (!item) return;
    const next = reorderFavs(getFavs(this.ctx), item.value, target && target.id);
    if (!next) return;
    await setFavs(this.ctx, next);
    favProvider.refresh();
  }
}

module.exports = {
  STORE_KEY, getFavs, setFavs, checkFavExists, setFavProvider, addFavouriteFromUri, removeFavourite,
  FavouritesProvider, FavouritesDragAndDrop, reorderFavs,
};
