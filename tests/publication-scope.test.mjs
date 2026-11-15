import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, access, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publicationEnabled, publicationStatus} from '../app/publication-permission.mjs';
import {applyPublicationScope} from '../scripts/apply-publication-scope.mjs';

test('publication permission is independent of successful refresh and defaults closed',()=>{
  assert.equal(publicationEnabled('manitoba'),true);
  for (const key of ['saskatchewan','quebec','ontario','unknown','__proto__']) {
    assert.equal(publicationEnabled(key),false);
    const status={state:'verified',lastVerified:'2026-11-15T12:00:00Z'};
    assert.equal(publicationStatus(key,status).state,'publication-review');
    assert.equal(publicationStatus(key,status).lastVerified,status.lastVerified);
    assert.equal(status.state,'verified');
  }
});

test('build strips excluded data and counts without rewriting verification dates',async()=>{
  const root=await mkdtemp(join(tmpdir(),'watch-policy-test-'));
  try {
    const save=(name,value)=>writeFile(join(root,name),JSON.stringify(value));
    const date='2026-11-15T12:00:00Z';
    await save('jurisdiction-status.json',{metadata:{},jurisdictions:{manitoba:{state:'verified',lastVerified:date},quebec:{state:'verified',lastVerified:date}}});
    await save('data-audit.json',{metadata:{auditedAt:date},liveJurisdictions:[{key:'manitoba',published:true,currentRecordCount:5},{key:'quebec',published:true,currentRecordCount:10}]});
    await save('province-coverage.json',{provinces:[{key:'manitoba'},{key:'quebec'}]});
    await save('manitoba-mining.json',{features:[]});
    await save('quebec-mining.json',{features:[]});
    await mkdir(join(root,'quebec-claims'));
    await save('quebec-claims/index.json',{});
    await applyPublicationScope(root);
    await applyPublicationScope(root); // Idempotent, safe during repeat builds.
    await access(join(root,'manitoba-mining.json'));
    await assert.rejects(access(join(root,'quebec-mining.json')));
    await assert.rejects(access(join(root,'quebec-claims/index.json')));
    const audit=JSON.parse(await readFile(join(root,'data-audit.json')));
    assert.equal(audit.metadata.totalCurrentRecordCount,5);
    assert.equal(audit.metadata.auditedAt,date);
    const status=JSON.parse(await readFile(join(root,'jurisdiction-status.json')));
    assert.equal(status.jurisdictions.quebec.lastVerified,date);
    assert.equal(status.jurisdictions.quebec.state,'publication-review');
  } finally {await rm(root,{recursive:true,force:true});}
});

test('permission gates cover APIs, direct assets, overview and scheduled refresh',async()=>{
  for (const file of ['../proxy.ts','../app/api/claims/sourceVerification.ts','../app/canada/page.tsx','../scripts/build-national-overview.mjs']) {
    assert.match(await readFile(new URL(file,import.meta.url),'utf8'),/publicationEnabled/);
  }
  assert.match(await readFile(new URL('../.github/workflows/refresh-public-data.yml',import.meta.url),'utf8'),/publication_scope.py/);
});
