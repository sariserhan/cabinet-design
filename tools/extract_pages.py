"""Extract independently addressable PDF pages for the ingestion worker."""
import argparse,hashlib,json
from pathlib import Path
import pymupdf
p=argparse.ArgumentParser();p.add_argument('pdf');p.add_argument('output');p.add_argument('--pages',required=True);a=p.parse_args()
source=Path(a.pdf);out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
doc=pymupdf.open(source);selected=json.loads(a.pages)
if doc.needs_pass:raise ValueError('Encrypted PDFs are not supported')
if not selected or len(selected)>40 or any(not isinstance(n,int) or n<1 or n>len(doc) for n in selected):raise ValueError('Invalid selected page numbers')
manifest={'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'pageCount':len(doc),'pages':[]}
for n in sorted(set(selected)):
 page=doc[n-1];size=page.rect
 def box(coords):
  r=pymupdf.Rect(coords)*page.rotation_matrix
  return {'x':max(0,r.x0/size.width),'y':max(0,r.y0/size.height),'width':min(1,(r.x1-r.x0)/size.width),'height':min(1,(r.y1-r.y0)/size.height)}
 words=[{'text':w[4],'boundingBox':box(w[:4]),'block':w[5],'line':w[6]} for w in page.get_text('words')]
 blocks=[{'text':b[4],'boundingBox':box(b[:4])} for b in page.get_text('blocks') if b[6]==0]
 text=page.get_text();label=page.get_label()
 # Printed footer labels are separate from physical positions; prefer footer text.
 foot=[w for w in page.get_text('words') if w[1]>size.height*.92 and (w[4].isdigit() or all(c in 'IVXLCDM' for c in w[4]))]
 if foot:label=foot[-1][4]
 tables=[]
 try:
  for t in page.find_tables().tables:tables.append({'boundingBox':box(t.bbox),'rows':t.extract()})
 except Exception:pass
 data={'pageNumber':n,'printedLabel':label or str(n),'text':text,'width':size.width,'height':size.height,'rotation':page.rotation,'words':words,'blocks':blocks,'tables':tables}
 (out/f'{n:03}.json').write_text(json.dumps(data,ensure_ascii=False))
 page.get_pixmap(matrix=pymupdf.Matrix(1.3,1.3)).save(out/f'{n:03}.png')
 manifest['pages'].append({'pageNumber':n,'printedLabel':data['printedLabel']})
(out/'manifest.json').write_text(json.dumps(manifest));print(json.dumps(manifest))
