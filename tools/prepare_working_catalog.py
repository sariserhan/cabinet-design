"""Package directly reviewed source additions; never infer actual dimensions from SKU digits."""
import json,re,hashlib
from pathlib import Path
import pymupdf
root=Path(__file__).resolve().parents[1]
review=json.loads((root/'artifacts/ai-source-review/source-review.json').read_text())
pdfpath=root/'sources/fabuwood-allure/Allure_Spec_Book_02-26-26.pdf'
assert hashlib.sha256(pdfpath.read_bytes()).hexdigest()==review['documentSha256']
pdf=pymupdf.open(pdfpath)
document_id='k174bpr9byf2vqp7ncswpq2j318ed0xq'
records=[]

def evidence(n,quote):
    page=pdf[n-1]; rects=page.search_for(quote)
    eid='ai-add:'+str(n)+':'+hashlib.sha256(quote.encode()).hexdigest()[:16]
    location={'kind':'full_page','reason':'Read source section, drawing and associated row together; text repeats or is multiline.'}
    if len(rects)==1:
        r=rects[0]; location={'kind':'region','regionId':eid,'boundingBox':{'x':r.x0/page.rect.width,'y':r.y0/page.rect.height,'width':r.width/page.rect.width,'height':r.height/page.rect.height}}
    return {'id':eid,'documentId':document_id,'documentSha256':review['documentSha256'],'pageNumber':n,'printedPageLabel':str(n-21),'sourceText':quote,'location':location}

def fact(sku,key,val,n,quote,unknown=None,method='text'):
    p=[evidence(n,sku)]
    if quote!=sku:p.append(evidence(n,quote))
    base={'id':'product:'+sku+':'+key,'confidence':0 if unknown else .9,'extractionMethod':method,'provenance':p,'reviewStatus':'unreviewed'}
    return dict(base,state='unknown',reason=unknown) if unknown else dict(base,state='known',value=val)

def add_rule(n,skus,name,source,constraint):
    ev=[evidence(n,source)]
    def operand(x):return {'value':x,'provenance':ev}
    c=dict(constraint)
    if 'values' in c:c['values']=[operand(x) for x in c['values']]
    if 'target' in c:c['target']={'kind':c['target'][0],'id':operand(c['target'][1])}
    records.append({'kind':'rule','data':{'id':f'rule:ai-add:{n}:{name}','catalogVersionId':'pending-working-catalog','scope':{'kind':'products','targets':[{'value':'product:'+s,'provenance':[evidence(n,s),evidence(n,source)]} for s in skus]},'sourceText':source,'provenance':ev,'confidence':.9,'reviewStatus':'unreviewed','modelingStatus':'modeled','constraint':c}})

def restrictions(n,skus):
    quote='Available for Galaxy - Frost, Dove, Indigo, Timber, & Desert Oak Only'
    for field,values in [('style',['Galaxy']),('finish',['Frost','Dove','Indigo','Timber','Desert Oak'])]:
        add_rule(n,skus,'restricted-'+field,quote,{'type':'allowed_values','field':field,'values':values,'outsideSet':'invalid'})

def footnote(n,sku,key,val,symbol,definition):
    records.append({'kind':'footnote','data':{'id':f'footnote:ai-add:{sku}:{key}','sku':sku,'field':key,'valueJson':json.dumps(val),'symbol':symbol,'provenance':[evidence(n,definition)],'markerEvidence':[evidence(n,sku)],'reviewStatus':'unreviewed'}})

for group in review['missingProducts']:
    n=group['pageNumber']; skus=group['skus']
    category={29:'wall_cabinet',31:'wall_cabinet',33:'accessory',35:'wall_cabinet',81:'accessory',91:'filler',103:'panel'}[n]
    title={29:'39" High Wall Cabinets',31:'42" High Wall Cabinets',33:'Glass Doors',35:'NO DOOR',81:'Base & Wall Accessories',91:'Fillers',103:'Panels'}[n]
    for sku in skus:
        fields={}
        def put(key,value,quote=None,method='text'):fields[key]=fact(sku,key,value,n,quote or sku,method=method)
        def unknown(key,reason):fields[key]=fact(sku,key,None,n,sku,unknown=reason)
        put('sku',sku);put('manufacturerCategory',title,title)
        # Explicitly tag taxonomy as a versioned interpretation rather than a source phrase.
        put('normalizedCategory',category,title)
        fields['normalizedCategory']['extractionMethod']='derived'
        fields['normalizedCategory']['derivation']={'ruleId':'ai-review-category-map','ruleVersion':'1','inputFactIds':['product:'+sku+':manufacturerCategory']}
        if n in [29,31]:
            put('heightIn',39 if n==29 else 42,title,method='vision');put('depthIn',12,'12"',method='vision')
            unknown('widthIn','No explicit per-SKU body width on this page; SKU digits retained only as an identifier.')
            if n==31 and sku.startswith('WBC'):
                width={'WBC2442':24,'WBC3042':30,'WBC3642':36}[sku]
                put('widthIn',width,sku,method='table');put('maximumInstalledWidthIn',width+3,sku,method='table')
                door,stile,opening={24:(9.5,7,7),30:(14.75,7.75,12.25),36:(21.5,7,19)}[width]
                for k,v in [('doorWidthIn',door),('stileWidthIn',stile),('doorSideOpeningIn',opening)]:put(k,v,sku,method='table')
            if sku in ['W3939','W3942']:
                put('centerStileWidthIn',1.5,'Includes 1½” center stile')
                footnote(n,sku,'centerStileWidthIn',1.5,'*','Includes 1½” center stile')
        elif n==33:
            put('glassType','clear','Glass doors are pre-installed with clear glass only')
            put('glassPreinstalled',True,'Glass doors are pre-installed with clear glass only')
            put('setQuantityPolicy','Necessary door quantity for the cabinet','Door Set SKUs will include the necessary quantity of doors for the cabinet')
            unknown('widthIn','Actual door width is not supplied by a per-SKU dimension table.')
            unknown('heightIn','Drawing shows multiple heights without an unambiguous mapping to every door-set SKU; host SKU dimensions are not door dimensions.')
        elif n==35:
            put('depthIn',12,'12"',method='vision')
            unknown('widthIn','No explicit per-SKU width; numeric SKU decoding is unverified.')
            unknown('heightIn','Shared diagram lists height options; assignment by SKU suffix remains unverified.')
            put('doorIncluded',False,'Door not included in price.')
            put('hingesInstalled',True,'Has hinges installed')
            put('interiorFinish','Matches frame color','Finished interior to match color of frame')
            put('shelfMaterial','tempered glass','Adjustable ¼” thick tempered glass shelves')
            put('shelfThicknessIn',.25,'Adjustable ¼” thick tempered glass shelves')
            put('depthChangeShelfMaterial','matching interior wood','Increased or decreased depth cabinets will come with matching interior wood shelves instead of')
            if sku not in ['NDW1230','NDW1530','NDW1830','NDW2430','NDW3030','NDW3630','NDW1236','NDW1242']:
                put('shelfCount',3,'Has three shelves');footnote(n,sku,'shelfCount',3,'*','Has three shelves')
        elif n==81:
            if sku.startswith('SPO-'):
                put('slideType','full extension ball-bearing','Full extension ball-bearing slides (BLUM soft-close slides not available)')
                put('blumSoftCloseAvailable',False,'Full extension ball-bearing slides (BLUM soft-close slides not available)')
                put('installation','On site between two cabinets','Installed on site between two cabinets')
                put('shelvesAdjustable',True,'Adjustable shelves')
                put('material','UV coated maple wood','UV coated maple wood')
            else:
                put('postAdjustable',True,'Adjustable metal post')
                put('installation','Brackets pre-installed; remaining parts installed on site','Top and bottom brackets will come pre-installed.')
                put('trayMaterial','plastic' if sku.startswith('LSP') else 'wood','PLASTIC' if sku.startswith('LSP') else 'WOOD')
                if sku.startswith('LSW27'):
                    put('trayDiameterIn',20,'20" trays');footnote(n,sku,'trayDiameterIn',20,'*','20" trays')
                put('configurationNotes','42-inch lazy susan has 3 trays; 42-inch poles can be cut to fit 36-inch cabinet','42" lazy susan has 3 trays')
            for key in ['widthIn','heightIn','depthIn']:unknown(key,'Overall accessory dimensions are not given by a per-SKU dimension table; nominal host digits are not actual accessory measurements.')
        elif n==91:
            for key in ['widthIn','heightIn','thicknessIn']:unknown(key,'No explicit per-SKU dimension mapping/thickness; do not infer from SKU digits or unrelated material specifications.')
            if sku.startswith('BF'):
                put('heightIn',29.875,'29 7/8”',method='vision');put('finishedSurfaces','Long edges and front face','Base Fillers are finished on long edges and front face')
            else:put('finishedSurfaces','All four edges and front face','Wall/Tall Fillers are finished on all four edges and front face')
            if sku=='TF3120':
                put('backMayBeGrooved',True,'TF3120 may come grooved on back side');footnote(n,sku,'backMayBeGrooved',True,'*','TF3120 may come grooved on back side')
        elif n==103:
            for key in ['widthIn','heightIn','thicknessIn']:unknown(key,'No unambiguous product-specific measurement established in this review; returned-panel face width is not sheet thickness.')
            dims={'BEP':(24,34.5,.75),'REP1296':(12,96,.75),'REP2496':(24,96,.75),'REP3096':(30,96,.75),'REP30120':(30,120,.75)}
            if sku in dims:
                for key,value in zip(['widthIn','heightIn','thicknessIn'],dims[sku]):put(key,value,sku,method='vision')
            if sku in ['REP1296','REP2496','REP3096']:
                put('longEdgesBanded',True,'Both long edges (34-1/2" for BEP, 96" for REP) are edge-banded')
                footnote(n,sku,'longEdgesBanded',True,'*','Both long edges (34-1/2" for BEP, 96" for REP) are edge-banded')
            if sku in ['REP1-1/2','REP3','REP3096 x 1 1/2','REP3096 x 3']:
                put('sidesFlushFinished',True,'Sides are flush finished, (no 1/4" reveal)')
                footnote(n,sku,'sidesFlushFinished',True,'**','Sides are flush finished, (no 1/4" reveal)')
            if sku=='PAN-1/4':
                put('finishedSideCount',1,'Finished on 1 side only; Moisture Resistant MDF will have visable green core')
                footnote(n,sku,'finishedSideCount',1,'*','Finished on 1 side only; Moisture Resistant MDF will have visable green core')
            if sku in ['PLY-1/2','PLY-3/4','PLY-1/2 48X120','PLY-3/4 48X120']:
                put('finishedSideCount',2,'Finished on 2 sides only');footnote(n,sku,'finishedSideCount',2,'**','Finished on 2 sides only')
            if sku.startswith('IN PLY'):
                put('widthIn',48,'48”',method='vision');put('heightIn',96,'96”',method='vision')
        records.append({'kind':'product','data':{'id':'product:'+sku,'reviewStatus':'unreviewed','fields':fields}})
    selected=[]
    if n==29:selected=skus
    if n in [33,35]:selected=[s for s in skus if s.endswith('39')]
    if n==81:selected=['SPO-WF339','SPO-WF639']
    if n==91:selected=['WF339','WF639']
    if selected:restrictions(n,selected)
    if n in [29,31]:add_rule(n,[s for s in skus if s.startswith('WBC')],'adjacent-filler','Must use filler on adjacent side (not supplied)',{'type':'requires','target':('accessory_role','adjacent_filler')})
    if n==81:
        for role in ['filler','overlay_filler']:add_rule(n,[s for s in skus if s.startswith('SPO-')],role,'Filler & Overlay Filler are required and need to be ordered separately',{'type':'requires','target':('accessory_role',role)})

products=[r for r in records if r['kind']=='product']
assert len(products)==122
assert len({r['data']['id'] for r in records})==len(records)
out=root/'artifacts/working-catalog';out.mkdir(exist_ok=True)
(out/'additions.json').write_text(json.dumps(records,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'products':len(products),'rules':sum(r['kind']=='rule' for r in records),'footnotes':sum(r['kind']=='footnote' for r in records),'records':len(records)}))
