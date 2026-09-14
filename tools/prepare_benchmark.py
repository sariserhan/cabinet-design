"""Rebuild AI-drafted review artifacts; never writes human-verified ground truth.
Requires PyMuPDF 1.28.2. Run from the repository root.
"""
from pathlib import Path
import hashlib, html, json, re
import pymupdf

ROOT = Path('tests/fixtures/fabuwood-allure')
manifest = json.loads((ROOT/'source-manifest.json').read_text())
pdf_path = Path(manifest['localPath'])
assert hashlib.sha256(pdf_path.read_bytes()).hexdigest() == manifest['sha256']
doc = pymupdf.open(pdf_path)
NUMS = [2,4,8,9,22,23,25,27,29,31,33,35,51,52,55,58,60,76,79,81,91,92,97,103,104,114,116,118,124,125,134,137]
ROMAN = {2:'II',4:'IV',8:'VIII',9:'IX'}
def label(n):
    return ROMAN.get(n, str(n-21))
def write(name, value):
    (ROOT/name).write_text(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True)+'\n')

evidence = {}
def ev(n, text, method='text'):
    key = 'e-'+hashlib.sha256(f'{n}|{method}|{text}'.encode()).hexdigest()[:16]
    rects = doc[n-1].search_for(text)
    size = doc[n-1].rect
    evidence[key] = {'id':key,'documentSha256':manifest['sha256'],'pageNumber':n,
        'printedPageLabel':label(n),'sourceText':text,'extractionMethod':method,
        'localizationStatus':'unique_text_match' if len(rects)==1 else 'review_region_required',
        'boundingBoxes':[{'x':r.x0/size.width,'y':r.y0/size.height,'width':r.width/size.width,'height':r.height/size.height} for r in rects],
        'imagePath':f'pages/{n:03}.png'}
    return key

def fact(value,n,text,method='text',note=None):
    f={'value':value,'evidenceIds':[ev(n,text,method)],'reviewStatus':'unreviewed','confidence':None}
    if note: f['derivationNote']=note
    return f

products=[]
def product(sku,n,category,family, dims=None):
    fields={'sku':fact(sku,n,sku),'normalizedCategory':fact(category,n,family,'derived','Draft taxonomy mapping from manufacturer heading'),'manufacturerCategory':fact(family,n,family)}
    for field,(value,text,method) in (dims or {}).items():
        fields[field]=fact(value,n,text,method,'Draft SKU decoding; requires human confirmation' if method=='derived' else None)
    products.append({'id':f'product:{sku}','sku':sku,'pageNumber':n,'family':family,'fields':fields,'reviewStatus':'unreviewed','humanVerification':None})
    return products[-1]

def wall(n,skus,depth=12):
    for sku in skus:
        m=re.fullmatch(r'W(\d{2})(\d{2})(24)?(LU)?',sku)
        w,h=int(m[1]),int(m[2])
        product(sku,n,'wall_cabinet', '24" DEEP' if n==23 and not sku.endswith('LU') else 'LIFT-UP' if sku.endswith('LU') else '12"- 21" HIGH' if n==22 and h<24 else '24" HIGH DOUBLE DOOR' if n==22 else 'SINGLE DOOR' if w<24 else 'DOUBLE DOOR',
          {'widthIn':(w,sku,'derived'),'heightIn':(h,sku,'derived'),'depthIn':(depth,f'{depth}"','vision')})
wall(22, ['W2412','W3012','W3312','W3612']+[f'W{w}{h}' for h in [15,18] for w in [12,15,18,21,24,27,30,33,36]]+[f'W{w}{h}' for h in [21,24] for w in [24,30,33,36]])
wall(23,['W301524','W301824','W302124','W302424']+[f'W{w}{h}24' for w in [33,36] for h in [12,15,18,21,24]]+['W421224LU','W481224LU'],24)
for n,h in [(25,30),(27,36)]:
    wall(n,[f'W{w:02}{h}' for w in [9,12,15,18,21,24,27,30,33,36,39]])
    for w in [24,30,36]:
        sku=f'WBC{w}{h}'
        product(sku,n,'wall_cabinet','SINGLE DOOR BLIND',{'widthIn':(w,sku,'derived'),'heightIn':(h,f'{h}"','vision'),'depthIn':(12,'12"','vision')})
for n,skus in [(51,['B12','B15','B18','B21']+[f'B{w:02}FD' for w in [9,12,15,18,21,24,27,30,33,36,39]]),(52,['B24','B27','B30','B33SDF','B36SDF','B33','B36','B39','B42','B48']+[f'DB{w}' for w in [12,15,18,21,24,27,30,33,36]]),(55,['SB21','SB24','SB27','SB30','SB33SDF','SB36SDF','SB33','SB36','SB39','SB42'])]:
    for sku in skus:
        w=int(re.search(r'\d+',sku)[0])
        family=('Sink Base Cabinets' if n==55 else 'Base Cabinets')
        product(sku,n,'base_cabinet',family,{'widthIn':(w,sku,'derived'),'heightIn':(34.5,'34 1/2"','vision'),'depthIn':(24,'24"','vision')})
for w in [15,18,24,30,36]:
    for h in [84,90,93,96]:
        sku=f'TP{w}24{h}'
        product(sku,58,'pantry','24" Deep Tall Pantry Cabinets',{'widthIn':(w,sku,'derived'),'heightIn':(h,sku,'derived'),'depthIn':(24,'24"','vision')})
for h in [84,90,93,96]:
    sku=f'OC33{h}S'
    product(sku,60,'oven_cabinet','OVEN CABINET SINGLE WITH 3 DRAWERS',{'widthIn':(33,sku,'derived'),'heightIn':(h,sku,'derived'),'depthIn':(24,'24"','vision')})
for extension in ['E','H']:
    for w in [15,18,21,24,27,30,33,36]:
        p=product(f'ROD-B{w} BLUM {extension}',76,'accessory','Base Accessories')
        p['annotationNotes']=['SKU encodes host cabinet width, not actual drawer width. Dimensions remain unasserted.']
for sku in ['TBPO-BF3','SPO-BF3','SPO-BF3 BLUM','SPO-BF6','SPO-BF6 BLUM','MLU-B18']:
    product(sku,79,'accessory','Base Accessories')
for w,heights in [(3,[30,36,39,42,84,90,93,96]),(6,[30,36,39,42])]:
    for h in heights:
        sku=f'OLF{w}{h}'
        p=product(sku,92,'filler','OVERLAY',{'widthIn':(2.5 if w==3 else 5.5,'Actual width: 2½”' if w==3 else 'Actual width:  5½”','text'), 'heightIn':(h-5 if h>=84 else h-0.5, 'Height is 5" less then the cabinet height' if h>=84 else {30:'29 1/2”',36:'35 1/2”',39:'38 1/2”',42:'41 1/2”'}[h],'derived' if h>=84 else 'vision')})
        p['annotationNotes']=['Do not use nominal SKU dimensions as actual dimensions. Thickness is not established on this page.']
skins={'SK BASE':(23.25,30.125),'SK MC':(20.25,42.125),'SK TALL':(23.25,96.125),'SK T12D':(11.25,96.125),'SK W30':(11.25,30.125),'SK W36':(11.25,36.125),'SK W39':None,'SK W42':(11.25,42.125),'SK WD':(14.25,60.125)}
for sku,dims in skins.items():
    p=product(sku,104,'panel','FINISHED END SKINS',{'thicknessIn':(.25,'1/4"','vision')})
    if dims:
        line=next(x.strip() for x in doc[103].get_text().splitlines() if sku+':' in x)
        p['fields']['widthIn']=fact(dims[0],104,line)
        p['fields']['heightIn']=fact(dims[1],104,line)
    else:
        p['expectedBlockers']=['missing_required_field']
        p['annotationNotes']=['Listed SKU has no corresponding dimensions entry on this page. Search dependencies or mark source ambiguous; do not interpolate from adjacent skins.']
for sku in ['CM-1','CM-3','CM-4','CM-6']:
    p=product(sku,97,'molding',"Moldings (8')",{'lengthIn':(96,'96"','vision')})
    p['annotationNotes']=['Profile geometry requires separate diagram annotation; avoid assigning arbitrary width/height axes.']

footnotes=[]
def foot(n,skus,field,value,text,symbol):
    for sku in skus:
        footnotes.append({'id':f'footnote:{sku}:{field}','sku':sku,'field':field,'expected':fact(value,n,text),'symbol':symbol,'markerEvidenceIds':[ev(n,sku)],'reviewStatus':'unreviewed','humanVerification':None})
finishes=['Frost','Dove','Indigo','Timber','Desert Oak']
restriction='Available for Galaxy - Frost, Dove, Indigo, Timber, & Desert Oak Only'
foot(22,[f'W{w}{h}' for h in [15,18] for w in [12,15,18,21]],'doorCount',1,'Single door cabinet','*')
foot(22,[f'W{w}21' for w in [24,30,33,36]],'shelfCount',1,'Includes 1 shelf','**')
restricted=[(22,['W2421','W3321','W3621']),(23,['W302124','W332124','W362124']),(58,[f'TP{w}2493' for w in [15,18,24,30,36]]),(60,['OC3393S']),(92,['OLF339','OLF393','OLF639']),(104,['SK W39'])]
for n,skus in restricted:
    foot(n,skus,'allowedStyleFinish',{'style':'Galaxy','finishes':finishes},restriction,'♦')
foot(23,[f'W{w}{h}24' for w in [30,33,36] for h in [21,24]],'shelfCount',1,'Includes 1 shelf','*')
foot(51,['B09FD'],'shelfCount',0,'Does not include shelf','*')
foot(51,['B39FD'],'centerStileWidthIn',1.5,'Includes 1-1/2" wide center stile','*')
foot(52,['B39','B42','B48'],'centerStileWidthIn',3,'Includes 3" center stile','*')
foot(55,['SB39','SB42'],'centerStileWidthIn',3,'Includes  3" center stile','*')
foot(60,['OC3396S'],'topCabinetShelfCount',1,'Has one shelf in top cabinet.','*')
foot(92,[f'OLF3{h}' for h in [30,36,39,42,84,90,93,96]],'widthIn',2.5,'Actual width: 2½”','*')
foot(92,[f'OLF6{h}' for h in [30,36,39,42]],'widthIn',5.5,'Actual width:  5½”','**')
for h in [84,90,93,96]:
    foot(92,[f'OLF3{h}'],'heightIn',h-5,'Height is 5" less then the cabinet height','»')

rules=[]
def rule(n,key,scope,constraint,text,when=None,notes=None,dependencies=None):
    r={'id':'rule:'+key,'scope':scope,'constraint':constraint,'sourceText':text,'evidenceIds':[ev(n,text)],'reviewStatus':'unreviewed','humanVerification':None,'confidence':None}
    if when:r['when']=when
    if notes:r['annotationNotes']=notes
    if dependencies:r['dependencyPages']=dependencies
    rules.append(r)
for n,skus in restricted:
    for field,values in [('style',['Galaxy']),('finish',finishes)]:
        rule(n,f'{n}-restricted-{field}',{'skus':skus},{'type':'allowed_values','field':field,'values':values,'outsideSet':'invalid'},restriction)
for n,h in [(25,30),(27,36)]:
    rule(n,f'blind-filler-{h}',{'skus':[f'WBC{w}{h}' for w in [24,30,36]]},{'type':'requires','target':{'kind':'accessoryRole','value':'adjacent_filler'}},'Must use filler on adjacent side (not supplied)',notes=['Do not invent an exact compatible filler SKU.'])
for name,skus in [('towel',['TBPO-BF3']),('spice',['SPO-BF3','SPO-BF3 BLUM','SPO-BF6','SPO-BF6 BLUM'])]:
    for role in ['filler','overlay_filler']:
        rule(79,f'{name}-{role}',{'skus':skus},{'type':'requires','target':{'kind':'accessoryRole','value':role}},'Filler & Overlay Filler are required and need to be ordered separately',dependencies=[91,92])
rule(79,'mixer-host',{'skus':['MLU-B18']},{'type':'allowed_values','field':'hostSku','values':['B18FD'],'outsideSet':'invalid'},'For B18FD Only.',dependencies=[51])
rule(79,'mixer-door-drawer',{'skus':['MLU-B18']},{'type':'forbidden_values','field':'hostConfiguration','values':['door_drawer']},'Will not work in a door/drawer configuration.')
for field,lo,hi,text in [('ovenOpeningWidthIn',27,31,'Minimum Width opening 27”\n•\t Maximum cut out width 31”'),('ovenOpeningHeightIn',28.5,37,'Minimum Height opening 28 ½””\n•\t Maximum cut out height is 37”'),('ovenOverallHeightIn',None,37.5,'Maximum overall oven Height 37 ½”')]:
    rule(60,field,{'skus':[f'OC33{h}S' for h in [84,90,93,96]]},{'type':'dimension_range','field':field,'unit':'in','minimum':lo,'maximum':hi,'inclusive':True},text)
for mod,minimum,text in [('CUT-BASE',12,'Reduce depth of base cabinet (min. depth 12”)'),('CUT-DBASE',12,'Reduce depth of drawer base cabinet (min. depth 12”)'),('CUT-SBASE',4,'Reduce depth of sink base cabinet (4" min.)'),('CUT-WALL',4,'Reduce depth of wall cabinet (4" min.)')]:
    rule(114,mod,{'modification':mod},{'type':'dimension_range','field':'resultDepthIn','unit':'in','minimum':minimum,'maximum':None,'inclusive':True},text)
for mod in ['CHASE-TALL','CHASE-WALL','CHASE-DBASE','CHASE-BASE']:
    rule(118,mod+'-drawing',{'modification':mod},{'type':'requires','target':{'kind':'documentRole','value':'chase_drawing'}},'Must supply a drawing for all chase modifications.')
rule(116,'cut-rod-required',{'series':'Allure'},{'type':'conditional_requirement','target':{'kind':'modification','value':'CUT-ROD'}},'CUT-ROD modification will be automatically added when CUT-depth reduction\nhas been applied to a cabinet with a ROD accessory selected.',when={'all':[{'field':'cutDepthReductionApplied','op':'eq','value':True},{'field':'hasRodAccessory','op':'eq','value':True}]},dependencies=[76,114],notes=['Requires explicit typed accessory association; do not infer actual drawer dimensions from host SKU.'])

cases=[
 {'id':'missing-skin-dimensions','kind':'source_ambiguity','sku':'SK W39','pageNumber':104,'expectedBlockers':['missing_required_field'],'expected':'No invented width/height; retain listed SKU and finish restriction.'},
 {'id':'overlay-nominal-vs-actual','kind':'synthetic_candidate_corruption','sku':'OLF330','pageNumber':92,'injected':{'widthIn':3},'expectedValue':2.5,'expectedBlockers':['unresolved_conflict'],'expected':'Actual footnote width wins after reviewed resolution; never treat this injected conflict as a manufacturer contradiction.'},
 {'id':'wrong-footnote-scope','kind':'synthetic_candidate_corruption','sku':'W3021','pageNumber':22,'injected':{'symbol':'♦'},'expectedBlockers':['ambiguous_footnote_scope'],'expected':'The row has ** but no diamond; do not extend adjacent SKU finish restrictions.'},
 {'id':'missing-diagram','kind':'synthetic_evidence_removal','sku':'CM-1','pageNumber':97,'expectedBlockers':['diagram_dependency_not_verified'],'expected':'Removing diagram evidence blocks the dependent geometric fact.'},
 {'id':'stale-index','kind':'source_navigation_conflict','pageNumber':2,'dependencyPages':[51],'expected':'Index Base Cabinets label 27 does not match body start 30; locate by actual page evidence.'},
 {'id':'cross-page-mixer','kind':'source_rule','sku':'MLU-B18','pageNumber':79,'dependencyPages':[51],'examples':[{'hostSku':'B18FD','expected':'valid_for_host_rule'},{'hostSku':'B18','expected':'invalid'},{'expected':'unknown'}]},
 {'id':'conditional-cut-rod','kind':'source_rule','pageNumber':116,'dependencyPages':[76,114],'expected':'Depth reduction with selected ROD requires CUT-ROD; absent condition inputs remain unknown.'},
 {'id':'style-and-finish','kind':'source_rule','sku':'W2421','pageNumber':22,'examples':[{'style':'Galaxy','finish':'Frost','expected':'valid_for_restriction'},{'style':'Luna','finish':'Frost','expected':'invalid'},{'style':'Galaxy','finish':'Linen','expected':'invalid'}]},
]
for c in cases:c.update(reviewStatus='unreviewed',humanVerification=None)

(ROOT/'pages').mkdir(exist_ok=True)
for n in NUMS:
    page=doc[n-1]
    page.get_pixmap(matrix=pymupdf.Matrix(1.2,1.2)).save(ROOT/f'pages/{n:03}.png')
    (ROOT/f'pages/{n:03}.txt').write_text(page.get_text())
# Selected pages are visually inspected by the agent, not manually verified by a human.
selection={'status':'selected_for_annotation','humanVerification':None,'selectionRevision':2,'pageCount':len(NUMS),'sourcePageCount':len(doc),'pages':[{'pageNumber':n,'printedPageLabel':label(n),'inspection':'agent_visual_layout_check','role':'product_annotation' if any(p['pageNumber']==n for p in products) else 'rule_or_context_dependency'} for n in NUMS]}
write('page-selection.json',selection)
write('draft-products.json',products);write('draft-footnotes.json',footnotes);write('draft-rules.json',rules);write('draft-cases.json',cases);write('draft-evidence.json',evidence)
summary={'status':'draft_only','products':len(products),'footnoteFacts':len(footnotes),'rules':len(rules),'cases':len(cases),'humanVerifiedRecords':0,'accuracyMeasured':False}
write('draft-summary.json',summary)
# A static packet with local page images and inspectable JSON; no review status mutation.
parts=['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Allure benchmark review packet</title><style>body{font:16px system-ui;margin:2rem;max-width:1500px}article{border-top:1px solid #aaa;padding:1rem 0} .columns{display:grid;grid-template-columns:minmax(280px,1fr) minmax(280px,1fr);gap:1rem}img{width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}summary{cursor:pointer;padding:.5rem}nav a{display:inline-block;padding:.4rem}@media(max-width:750px){.columns{grid-template-columns:1fr}}</style><h1>Allure benchmark review packet</h1><p>AI-drafted annotations. No human-verified ground truth yet. This read-only packet does not approve or publish catalog data.</p>',f'<p>{len(products)} draft products · {len(footnotes)} footnote facts · {len(rules)} rules · {len(cases)} cases. Human-verified: 0.</p><nav>']
for n in NUMS:parts.append(f'<a href="#page-{n}">PDF {n} / {label(n)}</a>')
parts.append('</nav>')
for n in NUMS:
    parts.append(f'<article id="page-{n}"><h2>PDF page {n} · printed {label(n)}</h2><div class="columns"><a href="pages/{n:03}.png"><img loading="lazy" src="pages/{n:03}.png" alt="Allure PDF page {n}, printed {label(n)}"></a><div>')
    records=[('Product '+p['sku'],p) for p in products if p['pageNumber']==n]
    records += [('Footnote '+f['id'],f) for f in footnotes if evidence[f['expected']['evidenceIds'][0]]['pageNumber']==n]
    records += [('Rule '+r['id'],r) for r in rules if evidence[r['evidenceIds'][0]]['pageNumber']==n]
    records += [('Case '+c['id'],c) for c in cases if c['pageNumber']==n]
    for title,record in records:
        refs=set(re.findall(r'e-[0-9a-f]{16}',json.dumps(record)))
        bundle={'annotation':record,'evidence':{e:evidence[e] for e in sorted(refs)}}
        parts.append('<details><summary>'+html.escape(title)+'</summary><pre>'+html.escape(json.dumps(bundle,indent=2,ensure_ascii=False))+'</pre></details>')
    if not records:parts.append('<p>Context/dependency page; additional annotations may be needed.</p>')
    parts.append('</div></div></article>')
parts.append('</html>');(ROOT/'review-packet.html').write_text(''.join(parts))
snapshot={'status':'draft_only','files':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(ROOT.glob('draft-*.json')) if f.name!='draft-snapshot.json'},'sourceSha256':manifest['sha256'],'pageSelectionSha256':hashlib.sha256((ROOT/'page-selection.json').read_bytes()).hexdigest()}
write('draft-snapshot.json',snapshot)
print(json.dumps(summary))
