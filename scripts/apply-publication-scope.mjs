import {readFile, writeFile, readdir, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {publicationEnabled, publicationStatus} from '../app/publication-permission.mjs';

// Build-time enforcement also removes excluded assets from the deployable tree.
// Source history is retained in Git; raw evidence must remain outside public/.
export async function applyPublicationScope(root = fileURLToPath(new URL('../public/data/', import.meta.url))) {
  const read = async file => JSON.parse(await readFile(resolve(root,file),'utf8'));
  const save = async (file,value) => writeFile(resolve(root,file),JSON.stringify(value));
  const directory = await read('jurisdiction-status.json');
  const excluded = Object.keys(directory.jurisdictions).filter(key => !publicationEnabled(key));
  for (const key of excluded) {
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(key)) throw new Error('Invalid jurisdiction key');
    directory.jurisdictions[key] = publicationStatus(key, directory.jurisdictions[key]);
    for (const entry of await readdir(root,{withFileTypes:true})) {
      if (entry.name.startsWith(`${key}-`) && (entry.name.endsWith('.json') || entry.name === `${key}-claims`)) {
        await rm(resolve(root,entry.name),{recursive:entry.isDirectory(),force:true});
      }
    }
  }
  directory.metadata.publicationNote = 'Coverage requires both a passing dated source check and inclusion in the reviewed publication scope. Missing coverage is not zero activity.';
  await save('jurisdiction-status.json',directory);
  const audit = await read('data-audit.json');
  audit.liveJurisdictions = audit.liveJurisdictions.map(row => publicationEnabled(row.key) ? row : {
    ...row, published:false, status:'publication-review', sourceAvailability:directory.jurisdictions[row.key]?.state,
    currentRecordCount:0, bundledFeatureCount:0, claimDelivery:'unpublished',
    availabilityMessage:directory.jurisdictions[row.key]?.message,
  });
  audit.metadata.liveJurisdictionCount = audit.liveJurisdictions.filter(j => j.published).length;
  audit.metadata.unavailableJurisdictionCount = audit.liveJurisdictions.filter(j => !j.published).length;
  audit.metadata.totalCurrentRecordCount = audit.liveJurisdictions.filter(j => j.published).reduce((n,j)=>n+j.currentRecordCount,0);
  audit.metadata.publicationScopeApplied = true;
  // Never change auditedAt or source verification dates during this transformation.
  await save('data-audit.json',audit);
  const coverage = await read('province-coverage.json');
  coverage.provinces = coverage.provinces.filter(p => publicationEnabled(p.key));
  await save('province-coverage.json',coverage);
  console.log(`Publication scope applied: ${excluded.length} jurisdictions withheld; source dates unchanged.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await applyPublicationScope();
