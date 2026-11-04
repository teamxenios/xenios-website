"""Turn c1_facts.py output into the variants file that build_c1.py, write_manifest.py and verify_c1.py read.

usage: python -I -X utf8 c1_variants.py <facts.json> <variants.json>
Only public-safe fields are written: printed label text, ids, codes and the Jira reference of the label facts.
Workbook rows and source descriptions stay in facts.json, which is never published.
"""
import json, re, sys

FACT_REFS = {   # CLAUDE-2 label-facts file -> the KAN-59 comment that published it
    'batch-01/research-batch-01.label-facts.json': 'KAN-59/10654',
    'batch-02/research-batch-02.label-facts.json': 'KAN-59/10667',
    'batch-03/research-batch-03.label-facts.json': 'KAN-59/10681',
    'batch-04/research-batch-04.label-facts.json': 'KAN-59/10687',
}
# Per-compound do-not-print terms from the label facts (10681, 10687); checked on every printed string.
EXTRA_TERMS = {
    'Tesamorelin': ['Egrifta', 'HIV', 'lipodystrophy'],
    'Sermorelin': ['Geref'],
    'DSIP': ['sleep', 'EEG'],
    'Semax': ['nootropic', 'cognitive', 'neuroprotective', 'stroke'],
    'Kisspeptin': ['Kisspeptin-10', 'Kisspeptin-54', 'fertility', 'puberty', 'reproductive'],
    'Oxytocin': ['IU', 'USP', 'Pitocin', 'labor', 'lactation', 'bonding', 'social'],
}

facts = json.load(open(sys.argv[1], encoding='utf-8'))
out = []
for f in facts:
    if not all(f['checks'].values()):
        raise SystemExit('unchecked record ' + f['sku'])
    vst = f['labelFacts']['verifiedStaticText']
    name = vst['productName']
    mg = float(f['amountMg'])
    if mg != int(mg):
        raise SystemExit('non-integer amount needs a template review: ' + f['sku'])
    mg = int(mg)
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') + '-%dmg' % mg
    code = re.sub(r'[^A-Z0-9]', '', name.upper())
    variance = None
    if f['catalogDisplayName'] != name:
        if f['catalogDisplayName'].lower() != name.lower():
            raise SystemExit('name differs beyond case: %s vs %s' % (name, f['catalogDisplayName']))
        variance = dict(catalogDisplayName=f['catalogDisplayName'], printedName=name,
                        note='Printed name follows the verified label facts; the catalog display name differs only in case. Dataset wording is Root\'s decision.')
    out.append(dict(slug=slug, name=name, code=code, mg=mg, sku=f['sku'], offeringId=f['offeringId'],
                    sourceVariantId=f['sourceVariantId'], labelFactsRef=FACT_REFS[f['labelFacts']['file']],
                    labelFactsFile=f['labelFacts']['file'].split('/')[-1], labelFactsSha256=f['labelFacts']['sha256'],
                    verifiedStaticText=vst, extraDoNotPrintTerms=EXTRA_TERMS.get(name, []), nameVariance=variance))
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
for v in out:
    print(v['slug'], v['code'], v['mg'], v['sku'], v['labelFactsRef'], v['extraDoNotPrintTerms'], 'VARIANCE' if v['nameVariance'] else '')
