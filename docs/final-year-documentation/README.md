# Digital Madrasa — Final-Year Project Report

| File | What it is |
|---|---|
| `Digital_Madrasa_Project_Documentation.pdf` | The final report (71 pages, portrait, US Letter), structured one-for-one on the table of contents of the reference report "Livestock Market and VetCare" |
| `Digital_Madrasa_Project_Documentation.docx` | Editable version of the same report (open in Word; press F9 after edits to refresh the contents and lists) |
| `figures/diagrams/` | Architecture, class, use case, sequence, activity, DFD level 0/1, context, workflow, schema, wireframes, Agile, conceptual framework |
| `figures/erd/` | Complete ERD and seven module ERDs, generated from the live schema |
| `figures/screenshots/` | Screenshot panels captured from the running app (Android emulator, and the web build for the final screens) |
| `figures/front/` | University logo for the cover |
| `figures/charts/` | Charts built from measured data only (database, test runs, perf:api, perf:db, check:i18n, git history) |
| `placeholders/PLACEHOLDERS_TO_COMPLETE.md` | Every piece of evidence you still need to insert |
| `source/` | Scripts that generate the report and figures |
| `figures/mobile/` | Phone screenshots used in Chapter 6 (sign-up and the four dashboards) |
| `previous/` | Earlier versions (v2; v3 = the 170-page version) |

## Rebuilding

The report is generated rather than hand-formatted, so the diagrams and entity tables cannot drift from the database.

```sh
# 1. figures (Python 3 with matplotlib, Pillow, pymupdf; Node with docx and @hpcc-js/wasm-graphviz)
python source/figures-src/figs5.py <out>            # Agile, Gantt
python source/figures-src/figs7.py figures/diagrams figures/charts   # architecture, M-Pesa sequence, notification flow, Chapter 7/8 charts
python source/figures-src/compose3.py <captures dir> figures/screenshots   # final-iteration panels (raw captures are not kept; the panels are)
node   source/build/erd.mjs source/figures-src/schema2.json <out> && python source/figures-src/render.py <out> <out>
node   source/build/flows.mjs <out>                  # context, DFDs, workflow

# 2. the Word document
NODE_PATH=<dir with node_modules/docx> FIGDIR=figures SCHEMA=source/figures-src/schema2.json OUT=Digital_Madrasa_Project_Documentation.docx node source/build/main.js

# 3. the PDF (Windows + Microsoft Word; updates the contents, figure and table lists)
powershell -File source/figures-src/topdf.ps1 -Docx <full path to .docx> -Pdf <full path to .pdf>
python source/figures-src/setmeta.py Digital_Madrasa_Project_Documentation.pdf
python source/figures-src/qa.py Digital_Madrasa_Project_Documentation.pdf   # automated layout checks
```

The simplest way to insert your own evidence is to edit the `.docx` directly in Word (replace each dashed yellow box), then export to PDF from Word.


Personal details are left as placeholders (`[STUDENT FULL NAME]`, `[REGISTRATION NUMBER]`, `[SUPERVISOR NAME]`, `[MONTH], 2026`); see `placeholders/PLACEHOLDERS_TO_COMPLETE.md`.
