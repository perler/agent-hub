// One-time import of the state the extension kept under its old name, Claude Code Helper
// (extension id pat-erler.claude-code-helper). globalState is per extension id and cannot
// be read across extensions, so the last old release (0.78.7) writes these four keys to
// ~/.cache/claude-code-helper/globalstate-export.json on activation. Each key is imported
// only while the new one is still unset, so running this repeatedly is harmless.
const path = require('path');
const fs = require('fs');
const os = require('os');

const KEYS = ['favourites', 'hiddenSessions', 'pinnedSessions', 'fastHoverApplied'];

function exportFile() { return path.join(os.homedir(), '.cache', 'claude-code-helper', 'globalstate-export.json'); }

// Returns how many keys were imported.
async function importOldState(globalState, file = exportFile()) {
  let old;
  try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return 0; }
  let n = 0;
  for (const k of KEYS) {
    if (old['claudeHelper.' + k] === undefined || globalState.get('agentHub.' + k) !== undefined) continue;
    await globalState.update('agentHub.' + k, old['claudeHelper.' + k]);
    n++;
  }
  return n;
}

module.exports = { importOldState };
