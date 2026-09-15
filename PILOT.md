# Kitchen Studio pilot worksheet

## Purpose

Run one kitchen through Measure → Design → Check → Price → Present → Install. Record the time, confusing steps and corrections needed at each stage. This is a pilot of the product workflow, not an installation approval.

## Inputs needed for a real project

- A named room with confirmed wall lengths, ceiling height, door/window sizes and offsets, utility locations and dated site photos.
- The supplier name and a current, attributable price list matching the chosen SKU, dimensions, finish and configuration. Provide the actual supplier list rather than substituting demo prices.
- The intended client/reviewer and installer, with an agreed way to exchange files or reach the app.
- Manufacturer answers and human review for any catalog facts needed by the selected products.

No real room or supplier list was supplied with the feature request. Real-project execution remains pending those inputs. Automated validation uses a clearly labeled synthetic survey and supplier prices in the isolated QA account.

## Walkthrough and acceptance criteria

| Stage | Action | Acceptance criterion |
| --- | --- | --- |
| Measure | Record the survey and openings; deliberately adjust one dimension, then correct it. | Readiness detects the mismatch and clears it after correction. |
| Design | Place the specified cabinets and appliances; record the first revision milestone and its reason. | Dimensions, provenance and intended item count remain intact. |
| Check | Open all warnings and catalog blockers. | Each issue has an actionable explanation; unknown facts remain visibly unresolved. |
| Price | Import the real supplier list, compare proposals and capture a priced milestone. | Independently calculated line totals, tax/discount assumptions and final total match the export. Expired/missing prices do not produce a final quote. |
| Present | Export a selection board, collect favorites/reasons, preview and apply the chosen combination. Create a client review link and capture its approved snapshot in history. | Preferences round-trip without changing geometry; approval is tied to the exact reviewed revision. |
| Revise | Move one cabinet or change a finish and record why. | History shows the change and price impact; readiness reports that the captured approval no longer matches. |
| Install | Export a handoff, add site findings, then change a local note before importing the returned report. | The three-way comparison preserves the chosen version of each finding. Wall remapping is explicit when geometry changed. |
| Recover | Reload, reopen saved designs, export/import history and preferences. | Design data and choices persist; imported history cannot manufacture approval. |

## Results to record

- Pilot name / room:
- Survey date / measured by:
- Supplier / price source / expiry:
- App address / browser / device:
- Time per stage:
- Steps requiring assistance:
- Incorrect or missing source facts:
- Quote discrepancies:
- Client preference and revision outcome:
- Installer conflicts and their resolutions:
- Three highest-priority product improvements:

## Deployment prerequisite

The development backend must use the updated shared design schema to retain storage preferences, site notes and selection boards in cloud saves. This deployment remains subject to the previously requested approval. Local drafts and portable files can be piloted now. Keep downloaded reports and histories as backups; the unsigned client workspaces retain unsaved changes only in the current tab.

## Purchasing pilot extension

With the pilot client and actual supplier list, also verify:

- Capture approval of the baseline, change one cabinet, and confirm the old review link fails revised-scope verification. Obtain a new review approval and capture it against the change order.
- Export a purchase draft and reconcile SKU, exact configuration, dimensions, quantities and product subtotal with the supplier. Confirm lead time, availability, taxes, shipping and payment terms separately; no supplier order is sent by this app.
- Simulate one received, one missing and one damaged item; attach a photo and export the delivery report. Verify tracking retains original item references after design edits.
- Export/import the purchasing backup and reverify approvals. Check persistence after reload and the rejection of edits from a stale second tab.
- Add client, room and tags; refresh SKU search; archive and restore a completed project. Export organization metadata separately.

Automated fixtures remain synthetic. These steps do not establish real-world supplier accuracy or constitute a completed field pilot.
