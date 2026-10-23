# Final-year project report

**Digital Madrasa: An Integrated Application That Will Manage Madrasas in Kenya**, by Mohammednur Sukyan (BSCS/2024/52324), School of Business and Technology, Umma University. Supervisor: Mr. Patrick Muchiri Alianda.

| File | What it is |
| --- | --- |
| [`Digital_Madrasa_Final_Project_Report.pdf`](Digital_Madrasa_Final_Project_Report.pdf) | **The submitted report**: 99 pages, eight chapters, 41 figures, 15 tables |
| [`Digital_Madrasa_Final_Project_Report.docx`](Digital_Madrasa_Final_Project_Report.docx) | Editable Word version of the same report |
| [`FINAL_REPORT_QA.md`](FINAL_REPORT_QA.md) | Quality-assurance record: where each section came from, every wording change, and the automated checks |
| `figures/` | Diagrams, ERDs, charts and phone screenshots used in the report |
| `source/` | The scripts that generate the report and its figures |
| `previous/` | Earlier drafts, kept for reference |

## Chapters

1. Introduction
2. Literature Review
3. System Development Methodology
4. Requirements Gathering and Analysis
5. System Design
6. System Development and Implementation
7. Testing and Deployment
8. Discussions, Conclusions, Future Works and Recommendations

Appendices: questionnaires and interview guide, work plan, budget, repository, plagiarism report.

## Rebuilding

The report is generated rather than hand-formatted, so its figures and figures-of-fact stay in step with the system.

```sh
# figures that reflect the finished system (component, deployment, table share, unit tests)
python source/figures-src/figs_final.py figures/final <vitest-json>

# the report: content assembled from the two source documents, rendered in the academic format
cd source/final
python manuscript.py            # writes final.json and edits.json
python render.py final.json Digital_Madrasa_Final_Project_Report.docx
powershell -File final-pdf.ps1 -Docx <full path to .docx> -Pdf <full path to .pdf>
python qa_final.py Digital_Madrasa_Final_Project_Report.docx Digital_Madrasa_Final_Project_Report.pdf
```

Requires Python 3 with `python-docx`, Pillow, matplotlib and pymupdf, and Microsoft Word on Windows for the PDF export.
