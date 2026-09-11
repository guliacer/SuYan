// Read-only audit; application is simulated in memory to check metadata preservation.
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const directory = process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'release/win-unpacked/data/library';
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { buildTagOrganizationRows, applyTagOrganizationChoices } = await server.ssrLoadModule('/src/features/library/utils/tagOrganization.ts');
  const { isUnorganizedTagGroup } = await server.ssrLoadModule('/src/features/library/utils/tagKnowledge.ts');
  const [libraryText, entriesText] = await Promise.all(['library.json', 'tag-lexicon.json'].map(name => readFile(join(directory, name), 'utf8')));
  const library = JSON.parse(libraryText), entries = JSON.parse(entriesText);
  const before = JSON.stringify({ library, entries });
  const rows = buildTagOrganizationRows(library.items, entries);
  const other = rows.filter(row => row.originalGroup === '其他标签 Other');
  const unorganized = rows.filter(row => isUnorganizedTagGroup(row.originalGroup));
  const summarize = set => ({ total: set.length, resolved: set.filter(row => row.selected).length, pending: set.filter(row => row.status === 'pending').length, noise: set.filter(row => row.status === 'noise').length });
  const next = applyTagOrganizationChoices(library.items, entries, rows, rows.filter(row => row.selected));
  for (const locked of entries.filter(entry => entry.groupLocked)) assert.deepEqual(next.entries.find(entry => entry.id === locked.id), locked);
  assert.equal(next.items.length, library.items.length);
  assert.deepEqual(next.items, library.items, 'This coverage fix must not change work tags or metadata.');
  assert.equal(next.entries.length, entries.length);
  assert.equal(JSON.stringify({ library, entries }), before);
  // Explicitly choosing all suggestions may correct a previously locked standard group.
  // Unselected/custom entries and every work property must still survive unchanged.
  const suggestions = rows.filter(row => row.suggested);
  const reviewed = applyTagOrganizationChoices(library.items, entries, rows, suggestions);
  for (const original of entries) {
    const choice = suggestions.find(row => row.id === original.id);
    const actual = reviewed.entries.find(entry => entry.id === original.id);
    if (!choice) assert.deepEqual(actual, original);
    else if (choice.correction) {
      assert.equal(actual.label, original.label);
      assert.equal(actual.group, choice.group);
      for (const field of ['id', 'description', 'imageFileName', 'analysis']) assert.deepEqual(actual[field], original[field]);
    }
  }
  assert.deepEqual(reviewed.items, library.items);
  assert.equal(reviewed.entries.length, entries.length);
  assert.deepEqual(await Promise.all(['library.json', 'tag-lexicon.json'].map(name => readFile(join(directory, name), 'utf8'))), [libraryText, entriesText]);
  const groupAudit = [...new Set(rows.map(row => row.originalGroup))].map(group => ({
    group, count: rows.filter(row => row.originalGroup === group).length,
    corrections: rows.filter(row => row.originalGroup === group && row.correction).length,
  }));
  console.log(JSON.stringify({ works: library.items.length, tags: rows.length, other: summarize(other), unorganized: summarize(unorganized), totalSuggestions: rows.filter(row => row.selected).length,
    auditedGroups: groupAudit.length, corrections: rows.filter(row => row.correction).length, groupAudit,
    pending: unorganized.filter(row => row.status === 'pending').map(row => ({ label: row.label, group: row.group })), noise: unorganized.filter(row => row.status === 'noise').map(row => row.label),
    simulation: 'Default selection preserves locked entries; explicit review corrects standard groups only. All works unchanged; no disk writes.' }, null, 2));
  if (process.argv.includes('--details')) for (const row of rows.filter(row => row.correction)) console.log(`${row.label}: ${row.originalGroup} → ${row.group}`);
} finally { await server.close(); }
