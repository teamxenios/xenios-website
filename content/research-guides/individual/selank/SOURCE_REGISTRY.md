---
title: Selank Source Registry
type: research-guide-source-registry
compound: selank
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Selank Source Registry

Every source consulted for the Selank Guide, with its retrieval status. Sources marked UNVERIFIED
were not successfully read and cannot carry a claim on their own. Sources marked NON-EVIDENCE are
recorded only to document where an unusable claim originated.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Verification key

- **VERIFIED 2026-07-21**: retrieved and read in this research session at the URL shown.
- **VERIFIED (abstract only) 2026-07-21**: the abstract was retrieved and read. The full text was
  not read, and in every such case here the full text is in Russian.
- **UNVERIFIED**: fetch failed, was blocked, or returned empty or unrenderable content. Existence
  may be known from metadata, but the content was not read.
- **NON-EVIDENCE**: retrieved, but disqualified as a source of fact by the exclusion rules in
  SOURCE_PLAN.md.

## Registry

| ID | Title | Kind | URL | Retrieval status | Supports |
| --- | --- | --- | --- | --- | --- |
| S01 | PubMed E-utilities search, selank together with anxiety, 29 records | Bibliographic database, primary | https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=selank+AND+anxiety&retmax=40&retmode=json | VERIFIED 2026-07-21 | The size and shape of the Selank literature map. Also the absence of any systematic review or meta-analysis. |
| S02 | PubMed E-utilities search, selank restricted to trial and review publication types, 6 records of which 3 are unrelated false positives | Bibliographic database, primary | https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=selank+AND+trial+publication+types&retmax=40&retmode=json | VERIFIED 2026-07-21 | That only 3 genuine Selank trial records exist in that filter, and that a raw PubMed count overstates the evidence base because term mapping returns unrelated records. |
| S03 | PubMed abstracts for the four human records, PMID 18454096, 25176261, 26356395, 18577961 | Primary human literature, abstracts | https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=18454096,25176261,26356395,18577961&retmode=xml&rettype=abstract | VERIFIED (abstract only) 2026-07-21 | Every human evidence statement in the claim table, and the limitations attached to each. |
| S04 | Zozulia AA, Neznamov GG, Siuniakov TS, and colleagues. Efficacy and possible mechanisms of action of a new peptide anxiolytic selank in the therapy of generalized anxiety disorders and neurasthenia. Zh Nevrol Psikhiatr Im S S Korsakova, 2008. PMID 18454096 | Human trial, indexed as randomized controlled trial, Russian language | https://pubmed.ncbi.nlm.nih.gov/18454096/ | VERIFIED (abstract only) 2026-07-21 | The comparison against the benzodiazepine medazepam in 62 adults with generalised anxiety disorder and neurasthenia, and the reported similarity of anxiolytic effect. Also the measurement of serum enkephalin activity. |
| S05 | Medvedev VE, Tereshchenko ON, Israelian AIu, and colleagues. A comparison of the anxiolytic effect and tolerability of selank and phenazepam in the treatment of anxiety disorders. Zh Nevrol Psikhiatr Im S S Korsakova, 2014. PMID 25176261 | Human trial, indexed as clinical trial and comparative study, Russian language | https://pubmed.ncbi.nlm.nih.gov/25176261/ | VERIFIED (abstract only) 2026-07-21 | The comparison against the benzodiazepine phenazepam in 60 patients with anxiety disorders, and the reported anxiolytic and mild nootropic effects. |
| S06 | Medvedev VE, Tereshchenko ON, Kost NV, and colleagues. Optimization of the treatment of anxiety disorders with selank. Zh Nevrol Psikhiatr Im S S Korsakova, 2015. PMID 26356395 | Human trial, indexed as randomized controlled trial, Russian language | https://pubmed.ncbi.nlm.nih.gov/26356395/ | VERIFIED (abstract only) 2026-07-21 | The add-on design, phenazepam alone against phenazepam plus selank in 70 patients, and the reported reduction in undesirable side effects of phenazepam. This is a benzodiazepine-sparing result, not standalone efficacy. |
| S07 | Uchakina ON, Uchakin PN, Miasoedov NF, and colleagues. Immunomodulatory effects of selank in patients with anxiety-asthenic disorders. Zh Nevrol Psikhiatr Im S S Korsakova, 2008. PMID 18577961 | Human mechanistic study combined with in vitro work, Russian language | https://pubmed.ncbi.nlm.nih.gov/18577961/ | VERIFIED (abstract only) 2026-07-21 | Reported cytokine-regulating effects and the in vitro suppression of interleukin-6 gene expression by peripheral blood cells of patients with depression but not of healthy controls. Sample size was not stated in the retrieved abstract. |
| S08 | Kasian A, Kolomin T, Andreeva L, and colleagues. Peptide Selank Enhances the Effect of Diazepam in Reducing Anxiety in Unpredictable Chronic Mild Stress Conditions in Rats. Behav Neurol, 2017. PMID 28280289 | Primary preclinical, rats | https://pubmed.ncbi.nlm.nih.gov/28280289/ | VERIFIED 2026-07-21 | The rat finding that selank enhanced the anxiety-reducing effect of diazepam under unpredictable chronic mild stress. Also part of the GABAergic mechanism reasoning, and part of the benzodiazepine co-administration note. |
| S09 | Kolik LG, Nadorova AV, Seredenin SB. Selank Inhibits Ethanol-Induced Hyperlocomotion and Manifestation of Behavioral Sensitization in DBA/2 Mice. Bull Exp Biol Med, 2016. PMID 27878720 | Primary preclinical, DBA/2 mice | https://pubmed.ncbi.nlm.nih.gov/27878720/ | VERIFIED 2026-07-21 | The mouse finding on ethanol-induced hyperlocomotion and behavioural sensitisation. |
| S10 | Konstantinopolsky MA, Chernyakova IV, Kolik LG. Selank, a Peptide Analog of Tuftsin, Attenuates Aversive Signs of Morphine Withdrawal in Rats. Bull Exp Biol Med, 2022. PMID 36322304 | Primary preclinical, rats | https://pubmed.ncbi.nlm.nih.gov/36322304/ | VERIFIED 2026-07-21 | The rat morphine withdrawal finding. |
| S11 | Fomenko EV, Bobyntsev II, Ivanov AV, and colleagues. Effect of Selank on Morphological Parameters of Rat Liver in Chronic Foot-Shock Stress. Bull Exp Biol Med, 2019. PMID 31243679 | Primary preclinical, rats | https://pubmed.ncbi.nlm.nih.gov/31243679/ | VERIFIED 2026-07-21 | That liver morphology under chronic foot-shock stress in rats was studied. The direction of effect was NOT retrievable from the title and summary obtained, so no directional statement rests on this source. |
| S12 | Filatova E, Kasian A, Kolomin T, and colleagues. GABA, Selank, and Olanzapine Affect the Expression of Genes Involved in GABAergic Neurotransmission in IMR-32 Cells. Front Pharmacol, 2017. PMID 28293190 | Primary preclinical, IMR-32 human neuroblastoma cell line, in vitro | https://pubmed.ncbi.nlm.nih.gov/28293190/ | VERIFIED 2026-07-21 | The in vitro finding on expression of genes involved in GABAergic neurotransmission. Human-derived cells in a dish, not people. |
| S13 | ClinicalTrials.gov API v2, query.intr=selank, totalCount 2, both unrelated false positives | Trial registry, primary, negative result | https://clinicaltrials.gov/api/v2/studies?query.intr=selank&format=json&countTotal=true | VERIFIED 2026-07-21 | That there is no registered Selank trial as an intervention. |
| S14 | ClinicalTrials.gov API v2, query.term=selank, totalCount 10, all unrelated false positives | Trial registry, primary, negative result | https://clinicaltrials.gov/api/v2/studies?query.term=selank&format=json&countTotal=true | VERIFIED 2026-07-21 | That there are zero registered Selank trials by any term match. The 10 returned records concern transcranial magnetic stimulation, dyslexia stimulation, brivaracetam in epilepsy, high-altitude hypoxia, and imagery rescripting. |
| S15 | Vademec. Минздрав отменил регистрацию 71 препарата и исключил из ГРЛС 14 субстанций, 21 January 2026 | Regulatory news, Russian pharmaceutical trade press | https://vademec.ru/news/2026/01/21/minzdrav-otmenil-registratsiyu-71-preparata-i-isklyuchil-iz-grls-14-substantsiy/ | VERIFIED 2026-07-21 | That on 20 to 21 January 2026 the Russian Ministry of Health cancelled the marketing registration of 71 medicinal products and excluded 14 pharmaceutical substances from the State Register of Medicines, that the Peptogen products Semax and Selank are named among the cancelled registrations, that selank is named among the excluded substances, and that the reported reason is a request from the registration certificate holders rather than a safety withdrawal. |
| S16 | VShOUZ. Регулятор исключил из ГРЛС 14 субстанций и отменил регистрацию 71 лекпрепарата, 22 January 2026 | Regulatory news, independent corroboration | https://www.vshouz.ru/news/minzdrav/wcs-20789/ | VERIFIED 2026-07-21 | The same action, named independently, including Semax and Selank from Peptogen and the same holder-request reason. Two independent outlets carrying the same named detail is what raises confidence in this finding. |
| S17 | Peptogen, manufacturer product page for Селанк | Manufacturer page, grade E | https://peptogen.ru/products/ | VERIFIED 2026-07-21 | Only that the manufacturer lists indications for Selank (anxiety, stress, depressive symptoms, heightened nervous fatigue, neurasthenia, and generalised anxiety disorder) and that it publishes NO registration certificate number and NO registration date. Manufacturer indication claims are not evidence of efficacy and are not repeated as fact. |
| S18 | FDA warning letter, Tailor Made Compounding LLC, 2020 | Regulatory, primary, NOT retrieved | https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/tailor-made-compounding-llc-594743-04012020 | UNVERIFIED | Nothing on its own. Every direct fetch to www.fda.gov returned HTTP 404 to this retrieval path. Search-result summaries indicate Selank was among substances used in compounded products and that Selank and Semax were not nominated for the 503A bulks list. A human must open this letter, and the 2021 letter to Advanced Nutriceuticals LLC dba The Guyer Institute, before publication. |
| S19 | WADA Prohibited List page and the 2026 list PDF | Anti-doping regulator, primary, NOT retrieved | https://www.wada-ama.org/en/prohibited-list | UNVERIFIED | Nothing. Both the page and the PDF returned empty content. Selank was not confirmed to appear by name on any WADA list, and no anti-doping status is asserted anywhere in this folder in either direction. |
| S20 | PeakedLabs vendor blog, Selank and anxiety | Vendor or marketing blog | https://peakedlabs.com/blog/selank-peptide-anxiety | NON-EVIDENCE | Nothing. Recorded only to document the origin of the unsupported claims of zero dependence, zero withdrawal, no rebound anxiety, no insomnia, and no autonomic instability across roughly 192 Russian trial subjects. Those claims are prohibited by name in CLAIM_TABLE.md. |
| S21 | Adversarial retrieval control. PubMed esummary for a fabricated PMID (99999123), returning "cannot get document summary" | Methodological control | https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=99999123&retmode=json | VERIFIED 2026-07-21 | That the retrieval path used for this folder returns an error for a non-existent record rather than fabricating one. This does not validate any individual claim, it validates the method. |

## Sources that were sought and not obtained

These are gaps, not sources. They are listed so a reviewer can close them.

| Item | Why it matters | Outcome this session |
| --- | --- | --- |
| Russian State Register of Medicines (GRLS), registration and cancellation records for Selank | Would put the single most consequential statement in this folder on a primary regulator record rather than on trade press | grls.minzdrav.gov.ru was not queried successfully, and a pharm-portal GRLS mirror record returned no readable content. |
| A registration certificate number and date for the prior Russian registration | Would establish whether the widely repeated 2009 approval is real | Not obtained. Neither the registry nor the manufacturer publishes it in the pages readable this session. |
| FDA warning letters, verbatim text | Would let FDA statements rest on the regulator rather than on search summaries | Every www.fda.gov fetch returned HTTP 404 to this retrieval path. |
| FDA 503A bulk drug substances lists | Would confirm the reported position that Selank and Semax were not nominated | Not retrieved, same fetch failure. |
| FDA Global Substance Registration System records for SELANK and SELANK DIACETATE | Would confirm chemical identity, and the amino acid sequence, from a primary registry | The records exist and were located, but rendered no usable content when fetched. |
| WADA Prohibited List, current text | Would settle the anti-doping question in either direction | The 2026 PDF and the prohibited-list page both returned empty content. |
| Full texts of the four Russian human papers | Would yield randomisation method, blinding, allocation concealment, dropout, effect sizes, confidence intervals, and adverse events, none of which are in the abstracts | Not obtained. All four are in Russian and only abstracts were retrieved. |
| Any placebo-controlled trial of Selank | Would separate drug effect from expectancy and from natural resolution of anxiety symptoms | None located anywhere in the literature. |
| Any non-Russian or originator-independent human trial | Would address the single largest weakness in this evidence base | None located. |
| Any systematic review or meta-analysis of Selank | Would provide an evidence-synthesis layer above the primary studies | None located. |
| Any human pharmacokinetic study | Would establish whether meaningful exposure is achieved in a person | None located. |
| Trial registries other than ClinicalTrials.gov, including the Russian national registry | The Russian trials may be registered elsewhere | Not searched. |
| PMID 17415472, a naloxone-blockade study in the retrieved PubMed set | Cited in the research record as implicating opioid-system involvement, but its species or model was not recorded | Not individually retrieved. No member-facing claim rests on it. [UNVERIFIED - requires human source check] |
