"""Inventory ITEM columns in pinned public books. No dimensions inferred from SKU digits.
Run with PYTHONPATH=.local/pdf-tools python3 tools/prepare_public_catalogs.py.
This generates reference drafts, not approved compiler output or benchmark truth.
"""
import hashlib,json,re
from pathlib import Path
import pymupdf
ROOT=Path(__file__).resolve().parents[1]
SOURCES={
'allure':'https://downloads.ctfassets.net/h0sz29d5jfiq/hMD9fgIvMzJcwmYgi7Oj0/6dc8130d4cec78aaee7533b4318c468d/Allure_Spec_Book_02-26-26.pdf',
'illume':'https://assets.ctfassets.net/h0sz29d5jfiq/3WQpoFMclEwEKiuRTDTLwJ/d14e44c04a340fcc5b4dae475dd79aca/Illume_Spec_Book_02-26-26.pdf',
'ovela':'https://assets.ctfassets.net/h0sz29d5jfiq/W8MqbqBF0iuKOOK4o0GDA/10cb0535527c41d38266029f17e07675/Ovela_Spec_Book_02-26-26.pdf',
}
def category(title):
 t=title.lower()
 if 'accessor' in t or 'solution' in t or 'lighting' in t:return 'accessory'
 if 'panel' in t:return 'panel'
 if 'filler' in t:return 'filler'
 if 'molding' in t:return 'molding'
 if 'oven' in t:return 'oven_cabinet'
 if 'pantr' in t or 'tall cabinet' in t:return 'pantry'
 if 'wall cabinet' in t or 'wine cabinet' in t:return 'wall_cabinet'
 if 'base cabinet' in t:return 'base_cabinet'
 if 'vanit' in t:return 'vanity'
 if 'hood' in t:return 'hood'
 return 'accessory'
def lines(page):
 return [dict(text=''.join(s['text'] for s in l['spans']).strip(),box=list(l['bbox']),font=l['spans'][0]['font'],size=l['spans'][0]['size']) for b in page.get_text('dict')['blocks'] for l in b.get('lines',[]) if l['spans']]
# Preserve the existing Allure draft values and their provenance, never transfer across series.
old=json.loads((ROOT/'artifacts/completion/working-catalog.json').read_text())
existing={r['data']['fields']['sku']['value']:r['data'] for r in old['records'] if r['kind']=='product'}
manifest=[]
for series,url in SOURCES.items():
 path=next((ROOT/f'sources/fabuwood-{series}').glob('*.pdf'));sha=hashlib.sha256(path.read_bytes()).hexdigest();pdf=pymupdf.open(path)
 version=f'public-{series}-{sha[:12]}'; products={};pages=[]
 for n,page in enumerate(pdf,1):
  ls=lines(page)
  titles=[l['text'] for l in ls if l['size']>=14 and l['box'][1]<115]
  title=' '.join(dict.fromkeys(titles)) or 'Other catalog items'
  headers=[l for l in ls if l['text']=='ITEM']
  found=[]
  for l in ls:
   t=l['text'];x,y,_,_=l['box']
   if not (7.5<=l['size']<=8.5 and 'Regular' in l['font'] and 110<y<735):continue
   if not re.fullmatch(r'[A-Z][A-Z0-9 /()."\-¼½¾]*',t) or len(t)>80:continue
   hs=[h for h in headers if abs(h['box'][0]-x)<5 and h['box'][1]<y]
   if not hs:continue
   h=max(hs,key=lambda a:a['box'][1])
   # A bold section title between the ITEM header and row ends that table.
   if any('Bold' in q['font'] and q['size']>=9 and h['box'][1]<q['box'][1]<y and abs(q['box'][0]-x)<35 for q in ls):continue
   sku=t.strip();found.append(sku)
   evidence={'pageNumber':n,'text':t,'boundingBox':[round(x/page.rect.width,6),round(y/page.rect.height,6),round((l['box'][2]-x)/page.rect.width,6),round((l['box'][3]-y)/page.rect.height,6)]}
   if sku in products:
    products[sku]['evidence'].append(evidence);continue
   products[sku]={'_id':f'{version}:{hashlib.sha256(sku.encode()).hexdigest()[:12]}','sku':sku,'category':category(title),'family':title,'pageNumber':n,'evidence':[evidence],'dimensionStatus':'unresolved','reviewStatus':'unreviewed'}
  pages.append({'pageNumber':n,'title':title,'itemHeaders':len(headers),'extractedRows':len(found)})
 # Existing reviewed-source draft is kept as a provenance-linked overlay, not certified truth.
 if series=='allure':
  for sku,p in existing.items():
   f=p['fields'];value=lambda k:f.get(k,{}).get('value') if f.get(k,{}).get('state')=='known' else None
   ev=f['sku']['provenance'][0]
   if sku not in products:products[sku]={'_id':f'{version}:{hashlib.sha256(sku.encode()).hexdigest()[:12]}','sku':sku,'category':value('normalizedCategory') or 'accessory','family':value('manufacturerCategory') or 'Existing Allure draft','pageNumber':ev['pageNumber'],'evidence':[{'pageNumber':ev['pageNumber'],'text':ev['sourceText']}],'dimensionStatus':'unresolved','reviewStatus':'unreviewed'}
   row=products[sku];row['category']=value('normalizedCategory') or row['category']
   row['dimensionEvidence']={}
   for field,key in [('widthIn','width'),('heightIn','height'),('depthIn','depth')]:
    v=value(field)
    if isinstance(v,(int,float)) and 0<v<=600:
     row[key]=v;row['dimensionEvidence'][key]=f[field]
   if all(k in row for k in ['width','height','depth']):row['dimensionStatus']='existing-source-draft'
 # Explicit actual-width tables + the same page's dimensioned diagrams.
 if series in ['illume','ovela']:
  for page_no,h in ([(28,30),(30,36),(32,39),(34,42)] if series=='illume' else [(24,30),(26,36),(28,39),(30,42)]):
   text=pdf[page_no-1].get_text()
   for width in [27,30,36]:
    sku=f'WBC{width}{h}';assert f'{sku}\n{width}"' in text and f'{h}"' in text and '13"' in text
    r=products[sku];r.update(width=width,height=h,depth=13,dimensionStatus='source-diagram-draft',sourceNote='Blind wall cabinet: adjacent filler required and not supplied. Specify blind left/right with supplier. Rendering is illustrative; verify installation footprint.')
    r['dimensionEvidence']={'pageNumber':page_no,'basis':'Actual-width table and height/depth drawing on this page; not SKU decoding.'}
  for page_no,h in ([(37,30),(37,36),(38,39),(38,42)] if series=='illume' else [(33,30),(33,36),(34,39),(34,42)]):
   sku=f'MC30{h}21';text=pdf[page_no-1].get_text();assert sku in text and '30"' in text and '21"' in text and f'{h}"' in text
   r=products[sku];r.update(width=30,height=h,depth=21,dimensionStatus='source-diagram-draft',sourceNote='Microwave cabinet: opening and appliance compatibility require supplier review. Maximum opening 28-1/2 W x 19-3/4 H inches; use care cutting the front panel.')
   r['dimensionEvidence']={'pageNumber':page_no,'basis':'Individual dimensioned microwave cabinet drawing; not SKU decoding.'}
 for r in products.values():r['_id']=f"{version}:p{r['pageNumber']}:{hashlib.sha256(r['sku'].encode()).hexdigest()[:12]}"
 entries=sorted(products.values(),key=lambda r:(r['pageNumber'],r['sku']))
 meta={'id':version,'series':series.title(),'documentVersion':'02-26-26','sourceUrl':url,'sourcePath':str(path.relative_to(ROOT)),'sha256':sha,'pageCount':len(pdf),'productCount':len(entries),'placeableCount':sum(r['category'] in ['base_cabinet','wall_cabinet','pantry','oven_cabinet'] and all(k in r for k in ['width','depth','height']) for r in entries),'humanVerified':False,'coverage':'All pages scanned for ITEM columns; extraction completeness and configurations unverified','freshness':'Dated February 2026; book warns of missing updates. Confirm current specifications with supplier.'}
 (ROOT/f'public/catalogs/{series}.json').write_text(json.dumps({'catalog':meta,'products':entries},ensure_ascii=False,separators=(',',':'))+'\n')
 (ROOT/f'artifacts/public-catalogs/{series}-coverage.json').write_text(json.dumps({'catalog':meta,'pages':pages},indent=2)+'\n')
 manifest.append(meta);print(series,len(entries),'items',meta['placeableCount'],'placeable drafts')
(ROOT/'src/designer/public-catalog-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
