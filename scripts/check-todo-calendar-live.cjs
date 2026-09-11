// Run after build:electron with: pnpm exec electron scripts/check-todo-calendar-live.cjs
// Uses an isolated temporary profile and the real Electron network service.
const { app } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'suyan-calendar-live-'));
  app.setPath('userData', profile);
  await app.whenReady();
  const service = require('../dist-electron/electron/main/library/todoCalendarStore.js');
  const rules = require('../dist-electron/src/features/prompts/todos/utils/todoWorkCalendar.js');
  const online = await service.getTodoHolidayYear(2026, true);
  assert.equal(online.status, 'online', online.message);
  assert.ok(online.calendar.days.length > 20);
  const defaults = await service.readTodoCalendar();
  assert.equal(rules.resolveTodoWorkday('2026-01-04', defaults, online.calendar.days).isWorkday, true);
  assert.equal(rules.resolveTodoWorkday('2026-01-02', defaults, online.calendar.days).isWorkday, false);
  const saved = await service.updateTodoCalendar({kind:'day', date:'2026-01-04', value:'rest'});
  assert.equal(rules.resolveTodoWorkday('2026-01-04', saved, online.calendar.days).isWorkday, false);
  assert.equal((await service.readTodoCalendar()).overrides['2026-01-04'], 'rest');
  const persisted = JSON.parse(await fs.readFile(path.join(profile, 'library', 'holiday-cache', '2026.json'), 'utf8'));
  assert.equal(persisted.days.length, online.calendar.days.length);
  process.stdout.write(JSON.stringify({status:'passed',year:2026,holidayDates:online.calendar.days.length,source:'holiday-cn',realElectronNetwork:true,profile})+'\n');
  app.quit();
})().catch(error=>{process.stderr.write(error.message+'\n');app.exit(1);});
