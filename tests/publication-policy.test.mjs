import test from 'node:test';
import assert from 'node:assert/strict';
import {isCurrentActivity, normalizeHolder} from '../app/current-record.mjs';
import {freshVerification, publicStatus} from '../app/publication-freshness.mjs';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
test('all map paths withhold past dates despite active or renewal wording', () => {
  for (const status of ['Active', 'GOOD_STAND', 'Reinstated', 'Renewed', 'ON_HOLD']) {
    assert.equal(isCurrentActivity({kind:'claim',status,expiryDate:'2026-09-08'}, '2026-09-09'), false);
  }
  assert.equal(isCurrentActivity({kind:'claim',status:'Renewed',expiryDate:'2027-09-09'}, '2026-09-09'), true);
  for (const status of [null, 'Mining Rights only', 'APPL_EXTEN', 'Inactive', 'Suspended']) assert.equal(isCurrentActivity({kind:'claim',status}), false);
  assert.equal(isCurrentActivity({kind:'claim',status:'Active',expiryDate:'2026-02-30'}), false);
});
test('holder identifiers remain separate from names and corporate names stay intact', () => {
  const input = {holder:'413102'};
  const result = normalizeHolder(input);
  assert.equal(result.holder, null);
  assert.equal(result.holderSourceIdentifier, '413102');
  assert.equal(input.holder, '413102');
  assert.equal(normalizeHolder({holder:'200691,408908'}).holderSourceIdentifier, '200691,408908');
  assert.equal(normalizeHolder({holder:'200691,408908'}).holder, null);
  assert.equal(normalizeHolder({holder:'123 Canada Ltd.'}).holder, '123 Canada Ltd.');
});
test('verification expires independently without changing the original evidence date', () => {
  const now = Date.parse('2026-09-10T12:00:00Z');
  assert.equal(freshVerification('2026-09-09T12:00:00Z', now), true);
  for (const date of [null, 'bad', '2026-09-08T11:59:59Z', '2026-09-11T12:00:00Z']) assert.equal(freshVerification(date, now), false);
  const state = {state:'verified',lastVerified:'2026-09-01T12:00:00Z'};
  assert.equal(publicStatus(state, now).state, 'source-unavailable');
  assert.equal(publicStatus(state, now).lastVerified, state.lastVerified);
  assert.equal(state.state, 'verified');
});
test('government viewport payloads cannot bypass the public expiry filter', async () => {
  const source = await readFile(new URL('../app/api/claims/sourceVerification.ts', import.meta.url), 'utf8');
  const definition = source.match(/export function eligibleSourceFeatures[\s\S]*$/)[0].replace('export ', '');
  const javascript = ts.transpileModule(definition, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const filter = new Function('isCurrentActivity', `${javascript}; return eligibleSourceFeatures;`)(isCurrentActivity);
  const rows = [
    {properties:{TENURE_STATUS_DESC:'Active',CLAIM_DUE_DATE:Date.parse('2020-01-01')}},
    {properties:{TENURE_STATUS:'Active',EXPIRY_DATE:'2099-01-01'}},
    {properties:{CLAIM_STAT:'SUSPENDED',CANCEL_DT:null}},
    {properties:{STATUS:null}},
  ];
  assert.deepEqual(filter(rows), [rows[1]]);
  assert.throws(() => filter(undefined));
});

test('rebuilding preserves the source date for holder fields without registry overrides', async () => {
  for (const file of ['../scripts/canada-mining/build_public_dataset.py', '../scripts/manitoba-mining/build_portal_dataset.py']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /"holderVerifiedAt":[\s\S]{0,180}else generated_at\[:10\]/);
  }
});
