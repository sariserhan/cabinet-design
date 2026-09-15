# Catalog Compiler demo

The existing Allure catalog is ready to demonstrate: 311 products, 46 rules, 90 footnotes, and source links across 32 PDF pages. Sign in with your existing account. The expanded catalog is selected by default.

## Connect from your laptop

The demo runs on the remote machine at 127.0.0.1:3001. Port 3000 is occupied by another project.

```sh
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:4001:127.0.0.1:3001 headless
```

Open http://localhost:4001. Keep the SSH terminal open. If local port 4001 is already occupied, replace the first 4001 with 4002 and open http://localhost:4002.

## Three-minute walkthrough

1. Open Catalog. Select “Cabinet dimensions · WBC2442” to show searchable structured product information.
2. Select Inspect PDF to show the source page alongside extracted fields.
3. Return to Catalog and choose “Molding profile · CM-1” to explore a different product shape.
4. Choose “An unresolved dimension · OLF330” and inspect its source. Missing thickness remains explicit instead of being invented.
5. Open Rules to inspect availability and compatibility constraints and their evidence.

The banner identifies this as an AI-reviewed demo draft. Production publication and human verification are separate; the demo does not mark records approved or verified. Browsing the existing catalog needs no new AI API credits. New PDF compilation still requires a configured and funded provider.

## Run locally on the server

```sh
npm run dev -- --port 3001
```

Validation: lint, TypeScript checks, and production build passed. Playwright checked catalog entry, OLF330 filtering, source inspection, resetting filters, and Rules navigation with the isolated QA account at desktop 1536×1024 and mobile 390×844. No browser runtime errors or horizontal page overflow. The QA account uses its own sample catalog; no real-user review status was changed.
