// Simple adapter that maps an LLM-style JSON `actions` array to manager API calls
// Usage: POST actions to this module (or import into server). For MVP this is a minimal helper.

const fetch = require('node-fetch');

async function runActions(sessionUrl, actions) {
  const results = [];
  for (const a of actions) {
    if (a.type === 'shell') {
      const resp = await fetch(`${sessionUrl}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: a.cmd, timeout: a.timeout || 60000 })
      });
      const j = await resp.json();
      results.push({ action: a, result: j });
    } else if (a.type === 'write_file') {
      // write via base64 -> echo
      const content = Buffer.from(a.content || '', 'utf8').toString('base64');
      const cmd = `base64 -d <<< ${content} > ${a.path}`;
      const resp = await fetch(`${sessionUrl}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd, timeout: 10000 })
      });
      const j = await resp.json();
      results.push({ action: a, result: j });
    } else if (a.type === 'screenshot') {
      // For MVP: not implemented — placeholder to demonstrate support path
      results.push({ action: a, result: { error: 'screenshot-not-implemented' } });
    } else {
      results.push({ action: a, result: { error: 'unknown-action' } });
    }
  }
  return results;
}

module.exports = { runActions };
