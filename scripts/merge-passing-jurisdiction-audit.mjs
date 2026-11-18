// Merge a scoped passing audit without claiming other jurisdictions were rechecked.
import {readFile,writeFile} from 'node:fs/promises';
const [reportPath,key]=process.argv.slice(2);
if (!reportPath || !key) throw new Error('Usage: report-path jurisdiction-key');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const report=await read(reportPath);
const row=report.liveJurisdictions.find(r=>r.key===key);
if (report.metadata.result!=='passed' || report.liveJurisdictions.length!==1 || !row?.published || row.status!=='passed' || row.issues.length) throw new Error('Only a single passing jurisdiction audit may be merged');
const data=await read(`public/data/${key}-mining.json`);
if (row.generatedAt!==data.metadata.generatedAt || row.currentRecordCount!==data.metadata.databaseRecordCount) throw new Error('Audit does not describe this dataset');
const audit=await read('public/data/data-audit.json');
if (!audit.liveJurisdictions.some(r=>r.key===key)) throw new Error('Unknown jurisdiction');
audit.liveJurisdictions=audit.liveJurisdictions.map(r=>r.key===key?{...row,auditedAt:report.metadata.auditedAt}:r);
audit.metadata.partialAuditUpdatedAt=report.metadata.auditedAt;
audit.metadata.partialAuditNote=`${key} rechecked independently; other jurisdiction evidence dates and last full auditedAt unchanged.`;
audit.metadata.liveJurisdictionCount=audit.liveJurisdictions.filter(r=>r.published).length;
audit.metadata.unavailableJurisdictionCount=audit.liveJurisdictions.filter(r=>!r.published).length;
audit.metadata.totalCurrentRecordCount=audit.liveJurisdictions.filter(r=>r.published).reduce((n,r)=>n+r.currentRecordCount,0);
await writeFile('public/data/data-audit.json',JSON.stringify(audit));
