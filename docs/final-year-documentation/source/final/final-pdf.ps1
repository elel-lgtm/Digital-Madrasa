# Updates every field through Word, makes chapter-level contents entries bold
# (as in the student's reference report), saves the .docx and exports the PDF.
param([string]$Docx, [string]$Pdf)
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open($Docx, [ref]$false, [ref]$false)
    $toc1 = $doc.Styles.Item(-20)          # wdStyleTOC1
    $toc1.Font.Bold = $true
    $toc1.Font.Name = 'Times New Roman'
    $toc4 = $doc.Styles.Item(-23); $toc4.Font.Bold = $false; $toc4.Font.Name = 'Times New Roman'; $toc4.ParagraphFormat.LeftIndent = 0   # TOC4 carries the figure and table lists
    foreach ($id in -21, -22, -36) { $s = $doc.Styles.Item($id); $s.Font.Name = 'Times New Roman'; $s.Font.Bold = $false }   # TOC2, TOC3, Table of Figures
    foreach ($pass in 1..2) {
        $doc.Fields.Update() | Out-Null
        foreach ($t in $doc.TablesOfContents) { $t.Update() | Out-Null }
        foreach ($t in $doc.TablesOfFigures) { $t.Update() | Out-Null }
        $doc.Repaginate()
    }
    $doc.SaveAs([ref]$Docx, [ref]16)
    $doc.ExportAsFixedFormat($Pdf, 17)
    Write-Output ("  pages: " + $doc.ComputeStatistics(2))
    $doc.Close([ref]$false)
} finally { $word.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
