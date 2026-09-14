"""Check draft artifact integrity, not manufacturer truth or extraction accuracy."""
from pathlib import Path
import hashlib,json,re
ROOT=Path('tests/fixtures/fabuwood-allure')
def read(name):return json.loads((ROOT/name).read_text())
manifest=read('source-manifest.json')
assert hashlib.sha256(Path(manifest['localPath']).read_bytes()).hexdigest()==manifest['sha256']

snapshot=read('draft-snapshot.json')
assert snapshot['sourceSha256']==manifest['sha256']
assert snapshot['pageSelectionSha256']==hashlib.sha256((ROOT/'page-selection.json').read_bytes()).hexdigest()
for name,digest in snapshot['files'].items():
    assert Path(name).name==name and name.startswith('draft-') and name.endswith('.json')
    assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest, f'Stale draft snapshot: {name}'
assert set(snapshot['files'])=={p.name for p in ROOT.glob('draft-*.json') if p.name!='draft-snapshot.json'}

selection=read('page-selection.json')
pages={p['pageNumber'] for p in selection['pages']}
assert 20<=len(pages)<=40
products=read('draft-products.json');footnotes=read('draft-footnotes.json');rules=read('draft-rules.json');cases=read('draft-cases.json');evidence=read('draft-evidence.json')
assert 150<=len(products)<=200 and len(footnotes)>=30 and len(rules)>=30
assert len({p['sku'] for p in products})==len(products)
skus={p['sku'] for p in products}
for records in [products,footnotes,rules,cases]:
    assert len({r['id'] for r in records})==len(records), 'Duplicate annotation identity'
summary=read('draft-summary.json')
assert summary['products']==len(products) and summary['footnoteFacts']==len(footnotes) and summary['rules']==len(rules) and summary['cases']==len(cases)
assert summary['humanVerifiedRecords']==0 and summary['accuracyMeasured'] is False
for record in products+footnotes+rules+cases:
    assert record['reviewStatus']=='unreviewed' and record['humanVerification'] is None
    for key in re.findall(r'e-[0-9a-f]{16}',json.dumps(record)):
        assert key in evidence,key
for p in products:
    assert p['pageNumber'] in pages
    assert p['fields']['sku']['value']==p['sku']
    for field in p['fields'].values():
        assert field['evidenceIds'] and field['confidence'] is None
for f in footnotes:assert f['sku'] in skus
for r in rules:
    assert set(r['scope'].get('skus',[]))<=skus
    assert set(r.get('dependencyPages',[]))<=pages
for e in evidence.values():
    assert e['pageNumber'] in pages
    assert e['documentSha256']==manifest['sha256']
    assert e['boundingBoxes'],e['id']
    assert (ROOT/e['imagePath']).exists()
    for b in e['boundingBoxes']:
        assert all(0<=v<=1 for v in b.values())
        assert b['x']+b['width']<=1.000001 and b['y']+b['height']<=1.000001
skin=next(p for p in products if p['sku']=='SK W39')
assert 'widthIn' not in skin['fields'] and 'heightIn' not in skin['fields']
assert 'missing_required_field' in skin['expectedBlockers']
assert any(c['kind']=='synthetic_candidate_corruption' for c in cases)
for p in selection['pages']:
    assert (ROOT/f"pages/{p['pageNumber']:03}.png").exists()
    assert (ROOT/f"pages/{p['pageNumber']:03}.txt").exists()
print(f'PASS: {len(pages)} selected pages, {len(products)} draft products, {len(footnotes)} footnote facts, {len(rules)} rules, {len(cases)} cases, {len(evidence)} linked evidence snippets.')
print('This checks artifact integrity only. Human-verified records: 0. Accuracy: not measured.')
