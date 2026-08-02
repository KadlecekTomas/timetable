from pathlib import Path

path = Path("apps/web/lib/import/teaching-plan-workbook.ts")
content = path.read_text()
old = '''      formula: `IF(COUNTA(A${row}:I${row})=0,"",IF(OR(A${row}="",B${row}="",C${row}="",D${row}="",E${row}="",F${row}="",G${row}="",I${row}=""),"DOPLNIT",IF(B${row}=D${row},"STEJNÉ PŘEDMĚTY",IF(C${row}=E${row},"STEJNÝ UČITEL",IF(AND(G${row}="Pouze dvojhodiny",MOD(F${row},2)=1),"LICHÝ POČET",IF(AND(G${row}="Kombinace",OR(H${row}="",2*H${row}>=F${row})),"OPRAVIT KOMBINACI","SEDÍ")))))`,'''
new = '''      formula: `IF(COUNTA(A${row}:I${row})=0,"",IF(OR(A${row}="",B${row}="",C${row}="",D${row}="",E${row}="",F${row}="",G${row}="",I${row}=""),"DOPLNIT",IF(OR(B${row}=D${row},C${row}=E${row}),"OPRAVIT VÝMĚNU",IF(OR(AND(G${row}="Pouze dvojhodiny",MOD(F${row},2)=1),AND(G${row}="Kombinace",OR(H${row}="",2*H${row}>=F${row}))),"OPRAVIT ROZLOŽENÍ","SEDÍ"))))`,'''
if old not in content:
    raise SystemExit("Rotation workbook validation formula was not found")
path.write_text(content.replace(old, new, 1))
