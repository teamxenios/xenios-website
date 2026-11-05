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
    'batch-05/research-batch-05.label-facts.json': 'KAN-59/10855',
    'batch-05r2/research-batch-05r2.label-facts.json': 'KAN-59/10906',
    'batch-06/research-batch-06.label-facts.json': 'KAN-59/10906',
    'batch-07/research-batch-07.label-facts.json': 'KAN-59/10937',
    'batch-08/research-batch-08.label-facts.json': 'KAN-59/10959',
    'batch-09/research-batch-09.label-facts.json': 'KAN-59/10980',
    'batch-10/research-batch-10.label-facts.json': 'KAN-59/11039',
    'batch-11/research-batch-11.label-facts.json': 'KAN-59/11051',
    'batch-12/research-batch-12.label-facts.json': 'KAN-59/11064',
    # Batch 13 went to review in KAN-31/11084 (handoff KAN-6/11083) and was never posted here; KAN-59/11391 verified the
    # file by SHA-256 against its original source and handed it to this lane as the design input.
    'batch-13/research-batch-13.label-facts.json': 'KAN-59/11391',
    'batch-14/research-batch-14.label-facts.json': 'KAN-59/11091',
    'batch-15/research-batch-15.label-facts.json': 'KAN-59/11136',
    # CLAUDE-2's adoption of Session 3's KAN-59/11393 proposals (HCG 0298 and 0299, LL-37 0312), verifiedStaticText unchanged
    'XENIOS_CLAUDE2_RESEARCH_CONTENT_2026-11-04/LABEL_FACTS_ADOPTED_11393_2026-11-05.json': 'KAN-59/11584',
}
# Per-compound do-not-print terms from the label facts (10681, 10687, batches 05-09); checked on every printed string.
EXTRA_TERMS = {
    'Tesamorelin': ['Egrifta', 'HIV', 'lipodystrophy'],
    'Sermorelin': ['Geref'],
    # batch 10 (KAN-59/11039): two PubChem identity artefacts plus the benefit wording CLAUDE-2 excluded
    'ARA-290': ['cibinetide', 'pain', 'neuropath', 'wound', 'kidney', 'renal', 'retinal', 'cognition'],
    'AOD-9604': ['somatostatin', 'weight', 'fat', 'metabolic', 'obesity'],
    'GHRP-6': ['GHRP-2', 'pralmorelin', 'growth', 'appetite', 'body composition', 'body-composition', 'hormone release', 'hormone-release'],
    # batch 11 (KAN-59/11051): GHRP-2 is pralmorelin, not GHRP-6; no redox form for glutathione; no reduced form or INN for NAD+
    'GHRP-2': ['GHRP-6', 'pralmorelin', 'KP-102', 'growth', 'muscle', 'appetite', 'pain', 'stress', 'hormone', 'body composition', 'body-composition'],
    'Glutathione': ['reduced', 'oxidized', 'oxidised', 'GSH', 'GSSG', 'Isethion', 'Glutinal', 'Tathion', 'Copren', 'antioxidant', 'detox', 'skin', 'liver', 'wellness', 'supplement'],
    'NAD+': ['nadide', 'NADH', 'reduced', 'anti-ageing', 'anti-aging', 'energy', 'longevity', 'metabolic', 'wellness', 'supplement'],
    # KAN-225/11152 (CLAUDE-2 identity finding, no facts yet): TB-500 is the acetylated heptapeptide, not thymosin beta-4; never let either name reach the other's label
    'TB-500': ['thymosin', 'Tβ4', 'beta-4', 'beta 4', 'fequesetide', 'goralatide', 'SDKP', 'healing', 'repair', 'recovery'],
    'Thymosin Beta-4': ['TB-500', 'TB500', 'fequesetide', 'goralatide', 'SDKP', 'healing', 'repair', 'recovery'],
    # batch 12 (KAN-59/11064): the extract's name is a PubChem synonym artefact on the peptide record; no benefit, regulatory or compounding wording
    'Epithalon': ['Epithalamin', 'Epithalamine', 'Epitalamin', 'extract', 'pineal', 'longevity', 'anti-ageing', 'anti-aging', 'telomer', 'sleep', 'geroprotect', 'FDA', 'approved medicine', 'compounded', 'compounding', 'regulatory', 'indication'],
    'DSIP': ['sleep', 'EEG'],
    'Semax': ['nootropic', 'cognitive', 'neuroprotective', 'stroke'],
    'Kisspeptin': ['Kisspeptin-10', 'Kisspeptin-54', 'fertility', 'puberty', 'reproductive'],
    'Oxytocin': ['IU', 'USP', 'Pitocin', 'labor', 'lactation', 'bonding', 'social'],
    'SS-31': ['elamipretide', 'Forzinity', 'Barth', 'syndrome', 'FDA', 'approved medicine', 'muscle', 'mitochondrial', 'energy', 'anti-aging'],
    'Retatrutide': ['LY3437943', 'Lilly', 'weight', 'appetite', 'glycemic', 'metabolic', 'liver', 'trial'],
    'Tirzepatide': ['LY3298176', 'Lilly', 'Mounjaro', 'Zepbound', 'glycemic', 'diabetes', 'weight', 'obesity', 'appetite', 'apnea', 'trial'],
    '5-Amino-1MQ': ['NNMT', 'metabolism', 'fat', 'weight', 'NAD+ benefit'],
    'Semaglutide': ['NN9535', 'Ozempic', 'Wegovy', 'Rybelsus', 'Novo', 'glycemic', 'diabetes', 'weight', 'obesity', 'appetite', 'cardiovascular', 'liver', 'trial'],
    'Liraglutide': ['NN2211', 'NNC 90-1170', 'Victoza', 'Saxenda', 'Novo', 'glycemic', 'diabetes', 'weight', 'obesity', 'appetite', 'cardiovascular', 'liver', 'trial'],
    'Cagrilintide': ['CagriSema', 'semaglutide', 'combination', 'Novo', 'weight', 'appetite', 'obesity', 'metabolic', 'trial'],
    'PT-141': ['bremelanotide', 'Vyleesi', 'sexual', 'desire', 'arousal', 'HSDD', 'clinical'],
    'Melanotan I': ['afamelanotide', 'Scenesse', 'tanning', 'pigment', 'photoprotect', 'clinical'],
    'Melanotan II': ['tanning', 'pigment', 'erectile', 'appetite', 'metabolic'],
    'Gonadorelin': ['fertility', 'hormone', 'ovulation', 'veterinary', 'Factrel', 'GONAbreed', 'Fertagyl'],
    # batch 13 (KAN-59/11391): no pineal-extract or preparation wording and none of the three names it lists; no benefit or
    # disease wording. Whole words, because a term only matches where no letter follows it.
    'Pinealon': ['Cortexin', 'Epithalamin', 'Thymalin', 'pineal', 'extract', 'preparation', 'neuroprotection', 'neuroprotective',
                 'memory', 'cognition', 'cognitive', 'anti-ageing', 'anti-aging', 'geroprotective', 'geroprotector', 'Alzheimer',
                 'Huntington', 'disease'],
    # adopted 11393 facts (KAN-59/11584): no mass equivalent (verify_c1.py bars every mass unit on an IU record), no
    # recombinant or urinary origin, no clinical, pregnancy or fertility claim
    'HCG': ['recombinant', 'urinary', 'urine', 'clinical', 'pregnancy', 'pregnant', 'fertility', 'ovulation'],
}

def blend_terms(name, comps):
    """A blend prints every component's name, so it carries every component's do-not-print terms, except a term inside
    another component's own name (Cagrilintide lists semaglutide, which Cagrilintide + Semaglutide prints as its second
    component), plus any terms recorded for the blend itself from its adopted facts."""
    names = [c['name'].lower() for c in comps]
    out = list(EXTRA_TERMS.get(name, []))
    for c in comps:
        key = next((k for k in EXTRA_TERMS if k.lower() == c['name'].lower()), None)
        for t in EXTRA_TERMS.get(key, []):
            if t not in out and not any(t.lower() in n for n in names):
                out.append(t)
    return out


facts = json.load(open(sys.argv[1], encoding='utf-8'))
out = []
for f in facts:
    if not all(f['checks'].values()):
        raise SystemExit('unchecked record ' + f['sku'])
    vst = f['labelFacts']['verifiedStaticText']
    name = vst['productName']
    # The amount is the verified text with its unit, printed as the facts give it ("10 mg", "10,000 IU").
    amount, unit = f['amount'], f['amountUnit']
    comps = f.get('components')
    if comps is not None:
        # A blend (Root's Option B, KAN-59/11404): c1_facts.py joined the component amounts in name order ("10/10 mg").
        if unit != 'mg' or not re.fullmatch(r'\d+(?:\.\d+)?(?:/\d+(?:\.\d+)?)+ mg', amount or ''):
            raise SystemExit('blend amount %r has no template review: %s' % (amount, f['sku']))
        mg = None          # several amounts: each component's mass is in components, and no total is printed
        tail = '-' + '-'.join(n.replace('.', 'p') for n in amount[:-3].split('/')) + 'mg'
    elif unit == 'mg':
        mg = float(f['amountMg'])
        if mg != int(mg):
            raise SystemExit('non-integer amount needs a template review: ' + f['sku'])
        mg = int(mg)
        if amount != '%d mg' % mg:
            raise SystemExit('amount text %r is not %d mg: %s' % (amount, mg, f['sku']))
        tail = '-%dmg' % mg
    elif unit == 'IU':
        mg = None          # an activity unit has no mass, and the facts forbid printing a mass equivalent
        tail = '-%siu' % amount.split(' ')[0].replace(',', '')
    else:
        raise SystemExit('unit %r has no template review: %s' % (unit, f['sku']))
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') + tail
    code = re.sub(r'[^A-Z0-9]', '', name.upper())
    variance = None
    if f['catalogDisplayName'] != name:
        if f['catalogDisplayName'].lower() != name.lower():
            raise SystemExit('name differs beyond case: %s vs %s' % (name, f['catalogDisplayName']))
        variance = dict(catalogDisplayName=f['catalogDisplayName'], printedName=name,
                        note='Printed name follows the verified label facts; the catalog display name differs only in case. Dataset wording is Root\'s decision.')
    entry = dict(slug=slug, name=name, code=code, mg=mg, amount=amount, sku=f['sku'], offeringId=f['offeringId'],
                 sourceVariantId=f['sourceVariantId'], labelFactsRef=FACT_REFS[f['labelFacts']['file']],
                 labelFactsFile=f['labelFacts']['file'].split('/')[-1], labelFactsSha256=f['labelFacts']['sha256'],
                 verifiedStaticText=vst, extraDoNotPrintTerms=EXTRA_TERMS.get(name, []) if comps is None else blend_terms(name, comps),
                 nameVariance=variance)
    if comps is not None:
        entry['components'] = [dict(name=c['name'], amount=c['amount']) for c in comps]
    if f['labelFacts'].get('formNeutral'):
        if not f.get('packagingDeclaration'):
            raise SystemExit('form-neutral facts without a packaging declaration: ' + f['sku'])
        entry['packagingDeclaration'] = f['packagingDeclaration']
        entry['labelFactsHold'] = f['labelFacts'].get('hold')
    elif f.get('packagingDeclaration'):
        # Form-bearing facts under the declaration (KAN-59/11283): the declaration is the packaging authority.
        if not f['packagingDeclaration'].get('supersedesFactsForm'):
            raise SystemExit('form-bearing facts with a declaration must mark supersedesFactsForm: ' + f['sku'])
        entry['packagingDeclaration'] = f['packagingDeclaration']
    out.append(entry)
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
for v in out:
    print(v['slug'], v['code'], repr(v['amount']), v['sku'], v['labelFactsRef'], v['extraDoNotPrintTerms'], 'VARIANCE' if v['nameVariance'] else '')
