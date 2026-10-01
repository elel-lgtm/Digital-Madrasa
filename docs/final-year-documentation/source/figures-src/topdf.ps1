# Converts the report to PDF through Word, updating the table of contents and
# the list fields first so page numbers are generated rather than typed.
param(
    [Parameter(Mandatory = $true)][string]$Docx,
    [Parameter(Mandatory = $true)][string]$Pdf
)

$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0

try {
    $doc = $word.Documents.Open($Docx, [ref]$false, [ref]$false)

    # Update every field (the TOC is a field) and repaginate, twice, because the
    # first pass changes the page count and therefore the numbers it printed.
    foreach ($pass in 1..2) {
        $doc.Fields.Update() | Out-Null
        foreach ($toc in $doc.TablesOfContents) { $toc.Update() | Out-Null }
        $doc.Repaginate()
    }

    $doc.SaveAs([ref]$Docx, [ref]16)            # 16 = wdFormatDocumentDefault (.docx)
    $doc.ExportAsFixedFormat($Pdf, 17)          # 17 = wdExportFormatPDF
    $pages = $doc.ComputeStatistics(2)          # 2 = wdStatisticPages
    $words = $doc.ComputeStatistics(0)          # 0 = wdStatisticWords
    Write-Output "  pages: $pages"
    Write-Output "  words: $words"
    $doc.Close([ref]$false)
}
finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
