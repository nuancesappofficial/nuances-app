import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePaywallDevLink } from './paywallDevLinks.ts';

test('the 21st-card link with no params simulates the handoff example', () => {
  assert.deepEqual(parsePaywallDevLink('nuances://dev/paywall-21'), {
    kind: 'paywall-21',
    word: 'situationship',
    sourceLabel: 'Netflix',
    cardKind: 'word',
    pronunciation: 'improved',
  });
});

test('the 21st-card link keeps the pending word, source, card kind and pronunciation case', () => {
  assert.deepEqual(
    parsePaywallDevLink(
      'nuances://dev/paywall-21?word=red%20flag&source=YouTube+Shorts&kind=shot&pron=flat'
    ),
    {
      kind: 'paywall-21',
      word: 'red flag',
      sourceLabel: 'YouTube Shorts',
      cardKind: 'shot',
      pronunciation: 'flat',
    }
  );
});

test('the 21st-card link falls back to the defaults for unknown card kinds and pronunciation cases', () => {
  assert.deepEqual(
    parsePaywallDevLink('nuances://dev/paywall-21?word=+&source=%20&kind=video&pron=great'),
    {
      kind: 'paywall-21',
      word: 'situationship',
      sourceLabel: 'Netflix',
      cardKind: 'word',
      pronunciation: 'improved',
    }
  );
});

test('a malformed percent-encoded word still opens the 21st-card link with the raw text', () => {
  assert.equal(
    parsePaywallDevLink('nuances://dev/paywall-21?word=caf%E9')?.word,
    'caf%E9'
  );
});

test('links that are not dev paywall links are ignored', () => {
  assert.equal(parsePaywallDevLink('nuances://dev/reset-onboarding'), null);
  assert.equal(parsePaywallDevLink('nuances://dev/paywall-2'), null);
  assert.equal(parsePaywallDevLink('nuances://dev/paywalls?cards=3'), null);
  assert.equal(parsePaywallDevLink('nuances://open?manager=paywall'), null);
  assert.equal(parsePaywallDevLink('https://example.com/paywall-21'), null);
});

test('the settings link with no params simulates 12 cards and 8 pronunciation checks used', () => {
  assert.deepEqual(parsePaywallDevLink('nuances://dev/paywall'), {
    kind: 'settings',
    cardsUsed: 12,
    pronunciationUsed: 8,
  });
});

test('the settings link keeps used counts within the 20-unit starter allowance', () => {
  assert.deepEqual(parsePaywallDevLink('nuances://dev/paywall?cards=3&pron=0'), {
    kind: 'settings',
    cardsUsed: 3,
    pronunciationUsed: 0,
  });
  assert.deepEqual(parsePaywallDevLink('nuances://dev/paywall?cards=35&pron=-4'), {
    kind: 'settings',
    cardsUsed: 20,
    pronunciationUsed: 0,
  });
  assert.deepEqual(parsePaywallDevLink('nuances://dev/paywall?cards=7.9&pron=abc'), {
    kind: 'settings',
    cardsUsed: 7,
    pronunciationUsed: 8,
  });
});
