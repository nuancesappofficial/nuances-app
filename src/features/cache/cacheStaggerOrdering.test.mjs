import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStaggeredCreationDates } from './cacheStaggerOrdering.ts';

test('buildStaggeredCreationDates gives the 1st item the highest timestamp', () => {
  const baseTime = 1700000000000;
  const dates = buildStaggeredCreationDates(3, baseTime);

  assert.equal(dates.length, 3);
  // 1st item must be newer than 2nd, which must be newer than 3rd
  assert.ok(dates[0].getTime() > dates[1].getTime());
  assert.ok(dates[1].getTime() > dates[2].getTime());
  assert.equal(dates[0].getTime(), baseTime + 30);
  assert.equal(dates[1].getTime(), baseTime + 20);
  assert.equal(dates[2].getTime(), baseTime + 10);
});

test('buildStaggeredCreationDates handles single item', () => {
  const baseTime = 1700000000000;
  const dates = buildStaggeredCreationDates(1, baseTime);

  assert.equal(dates.length, 1);
  assert.equal(dates[0].getTime(), baseTime + 10);
});

test('buildStaggeredCreationDates handles empty count', () => {
  const dates = buildStaggeredCreationDates(0);
  assert.deepEqual(dates, []);
});
