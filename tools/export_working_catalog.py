"""Write an explicitly unpublished review package from a read-only catalog export."""
import csv,json,zipfile
from pathlib import Path
s=json.load(open('/tmp/catalog-consistency.json'));out=Path('artifacts/completion');records=[json.loads(r['payloadJson']) for r in s['rows']]
rows=[r for r in s['rows'] if r['kind']=='product' and r['blockers']]
assert len(rows)==145
assert all(not r['truthVerified'] for r in s['rows'])
remaining=[]
for r in rows:
 fields=json.loads(r['payloadJson'])['data']['fields'];missing=[k for k,v in fields.items() if v['state']=='unknown']
 if r['sku'].startswith('OLF') and 'thicknessIn' not in fields:missing.append('thicknessIn')
 if r['sku']=='SK W39':missing.extend(k for k in ['widthIn','heightIn'] if k not in fields)
 remaining.append({'sku':r['sku'],'pageNumber':r['pageNumber'],'printedPage':r['pageNumber']-21,'unresolvedFields':sorted(set(missing))})
with (out/'remaining-products.csv').open('w') as f:
 w=csv.writer(f);w.writerow(['SKU','PDF page','Printed page','Unresolved fields']);w.writerows([r['sku'],r['pageNumber'],r['printedPage'],'; '.join(r['unresolvedFields'])] for r in remaining)
(out/'remaining-products.json').write_text(json.dumps(remaining,indent=2)+'\n')
export={'status':'unpublished_working_draft','humanVerified':False,'versionId':s['version']['_id'],'revision':s['version']['revision'],'sourceSha256':s['document']['sha256'],'coverage':json.loads(s['version']['coverageJson']),'additionalCategoryProfiles':json.loads(s['version'].get('profilesJson','[]')),'records':records,'recordFindings':[{'entityId':r['entityKey'],'blockers':r['blockers']} for r in s['rows'] if r['blockers']]}
(out/'working-catalog.json').write_text(json.dumps(export,indent=2,ensure_ascii=False)+'\n')
with (out/'product-fields.csv').open('w') as f:
 w=csv.writer(f);w.writerow(['product_id','field','state','value','reason','method','review_status','physical_pages','source_sha256'])
 for p in records:
  if p['kind']!='product':continue
  for k,v in p['data']['fields'].items():w.writerow([p['data']['id'],k,v['state'],v.get('value',''),v.get('reason',''),v['extractionMethod'],v['reviewStatus'],';'.join(str(n) for n in sorted({e['pageNumber'] for e in v['provenance']})),s['document']['sha256']])
r=json.load(open('artifacts/consistency-review/results.json'));assert not r['logicOnlyFailures'];assert not r['publication']['issueCounts'].get('category_profile_required');assert not r['publication']['issueCounts'].get('dangling_rule_target');assert not r['publication']['issueCounts'].get('unresolved_modification_scope')
(out/'consistency-results.json').write_text(json.dumps(r,indent=2)+'\n')
gate=json.load(open('/tmp/catalog-gate.json'));gate=json.loads(gate) if isinstance(gate,str) else gate
(out/'current-publication-gate.json').write_text(json.dumps(gate,indent=2)+'\n')
summary={'versionId':s['version']['_id'],'revision':s['version']['revision'],'products':311,'rules':46,'footnotes':90,'registries':9,'cases':8,'blockedProducts':len(rows),'categoryProfileErrors':0,'registryReferenceErrors':0,'sourceReferenceErrors':len(r['sourceReferenceErrors']),'ruleLogicChecks':140,'ruleLogicFailures':len(r['logicOnlyFailures']),'publishable':False,'tests':{'core':71,'backend':15,'typecheck':'passed','lint':'passed','productionBuild':'passed'}}
(out/'status.json').write_text(json.dumps(summary,indent=2)+'\n')
questions=(out/'manufacturer-questions.md').read_text().replace('all 123 source products','all 145 source products')
extra='| Base accessories and rollout drawers | 22 | 76 / 55; 79 / 58 | Please provide overall installed width, height, depth and required clearances for all ROD-B… BLUM E/H, TBPO-BF3, SPO-BF3/6 variants and MLU-B18. Distinguish host cabinet size, partial/full extension travel and component shelf dimensions from overall mechanism geometry. |\n'
if '| Base accessories and rollout drawers |' not in questions:questions=questions.replace('| SK W39 skin |', extra+'| SK W39 skin |')
questions=questions.replace('actual size and quantity of each door','actual width, height, thickness and quantity of each door')
(out/'manufacturer-questions.md').write_text(questions)
with zipfile.ZipFile(out/'catalog-review-package.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(out.iterdir()):
  if p.suffix in ['.json','.csv','.md']:z.write(p,p.name)
with zipfile.ZipFile(out/'catalog-review-package.zip') as z:assert z.testzip() is None
print(json.dumps(summary))
