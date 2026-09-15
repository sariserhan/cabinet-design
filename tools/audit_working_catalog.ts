import fs from 'node:fs';
import {recordDataSchema,recordEvidence,setRecordStatus} from '../src/catalog/record-data';
import {crossSourceConflicts} from '../src/catalog/cross-source';
import {executeBenchmarkCase} from '../src/catalog/cases';
import {evaluateRule} from '../src/catalog/rules';
import type {EvaluationContext} from '../src/catalog/rule-schema';
const input=JSON.parse(fs.readFileSync(process.argv[2] ?? '/tmp/catalog-consistency.json','utf8'));
const records=input.rows.map((row:{payloadJson:string})=>recordDataSchema.parse(JSON.parse(row.payloadJson))) as ReturnType<typeof recordDataSchema.parse>[];
const pages=input.pages as {pageNumber:number;printedLabel:string;text:string;imageStorageId?:string}[];
const rules=records.flatMap(r=>r.kind==='rule'?[r.data]:[]);
const products=new Set(records.filter(r=>r.kind==='product').map(r=>r.data.id));
const references=records.flatMap(r=>recordEvidence(r).map(e=>({entityId:r.data.id,...e})));
const sourceErrors=references.filter(e=>e.documentId!==input.document._id||e.documentSha256!==input.document.sha256||!pages.some(p=>p.pageNumber===e.pageNumber));
const conflictingEvidenceIds: string[]=[];
const evidenceById=new Map<string,string>();
for(const {entityId:_,...e} of references){const value=JSON.stringify(e);const prior=evidenceById.get(e.id);if(prior&&prior!==value)conflictingEvidenceIds.push(e.id);evidenceById.set(e.id,value);}
const danglingProducts=rules.flatMap(r=>r.scope.kind==='products'?r.scope.targets.filter(t=>!products.has(t.value)).map(t=>({rule:r.id,target:t.value})):[]);
const logicalCopies=records.map(r=>setRecordStatus(r,'approved'));
const cases=records.filter(r=>r.kind==='case').map(r=>r.kind==='case'?{id:r.data.id,live:executeBenchmarkCase(JSON.parse(r.data.expectationJson),records,pages),logicOnly:executeBenchmarkCase(JSON.parse(r.data.expectationJson),logicalCopies,pages)}:null).filter(Boolean);
const scenarios:{ruleId:string;scenario:string;expected:string;actual:string;passed:boolean}[]=[];
for(const rule of rules){
 if(rule.modelingStatus!=='modeled')continue;
 const first=rule.scope.targets[0]?.value;
 const base:EvaluationContext={catalogVersionId:input.version._id,seriesId:input.document.series,productId:rule.scope.kind==='products'?first:'product:B18',values:{cutDepthReductionApplied:true,hasRodAccessory:true},selection:{modification:rule.scope.kind==='modifications'&&first?[first]:[]}};
 const check=(scenario:string,expected:string,edit:(c:EvaluationContext)=>void)=>{const c=structuredClone(base);edit(c);const actual=evaluateRule({...rule,reviewStatus:'approved'},c).outcome;scenarios.push({ruleId:rule.id,scenario,expected,actual,passed:expected===actual});};
 const constraint=rule.constraint;
 if(constraint.type==='allowed_values'||constraint.type==='forbidden_values'){
  const inside=constraint.values[0]?.value;if(!inside)continue;
  check('listed value',constraint.type==='allowed_values'?'valid':'invalid',c=>{c.values[constraint.field]=inside;});
  check('outside value',constraint.type==='allowed_values'?'invalid':'valid',c=>{c.values[constraint.field]='__unlisted_value__';});
  check('missing value','unknown',c=>{delete c.values[constraint.field];});
 } else if(constraint.type==='dimension_range'){
  const inside=constraint.minimum?.value??constraint.maximum?.value;if(inside===undefined)continue;
  check('inclusive endpoint','valid',c=>{c.values[constraint.field]=inside;});
  if(constraint.minimum)check('below minimum','invalid',c=>{c.values[constraint.field]=(constraint.minimum?.value??0)-.125;});
  if(constraint.maximum)check('above maximum','invalid',c=>{c.values[constraint.field]=(constraint.maximum?.value??0)+.125;});
  check('missing dimension','unknown',c=>{delete c.values[constraint.field];});
 } else if(constraint.type==='requires'||constraint.type==='conditional_requirement'){
  check('required selection present','valid',c=>{c.selection[constraint.target.kind]=[...(c.selection[constraint.target.kind]??[]),constraint.target.id.value];});
  check('required selection absent','invalid',c=>{c.selection[constraint.target.kind]=[];});
  // Modification-scoped rules require keeping scope selected when the target is a document/accessory.
  check('selection unspecified','unknown',c=>{delete c.selection[constraint.target.kind];});
 }
}
let gate=JSON.parse(fs.readFileSync('/tmp/catalog-gate.json','utf8'));if(typeof gate==='string')gate=JSON.parse(gate);
const counts:Record<string,number>={};for(const i of gate.gate.issues)counts[i.code]=(counts[i.code]??0)+1;
const result={versionId:input.version._id,revision:input.version.revision,records:records.length,rules:rules.length,footnotes:records.filter(r=>r.kind==='footnote').length,uniqueEvidenceIds:evidenceById.size,sourceReferenceErrors:sourceErrors,conflictingEvidenceIds:[...new Set(conflictingEvidenceIds)],danglingProductScopes:danglingProducts,crossSourceConflicts:crossSourceConflicts(records),logicOnlyScenarioCount:scenarios.length,logicOnlyFailures:scenarios.filter(x=>!x.passed),scenarios,cases,publication:{publishable:gate.gate.publishable,issueCounts:counts,structuralIssues:gate.gate.issues.filter((i:{code:string})=>['unresolved_modification_scope','dangling_rule_target','invalid_derivation'].includes(i.code))},limitations:['Logic-only checks temporarily approve copies in memory; no live approval or human verification was changed.','Reference checks validate document hash/page identity and evidence-ID consistency, not factual correctness of every cited measurement.','Consult current publication issue counts for remaining blockers; no gate is waived by this audit.']};
fs.writeFileSync('artifacts/consistency-review/results.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,scenarios:undefined,cases:cases.map(c=>({id:c?.id,live:c?.live.passed,logicOnly:c?.logicOnly.passed})),publication:{publishable:result.publication.publishable,issueCounts:counts}},null,2));
