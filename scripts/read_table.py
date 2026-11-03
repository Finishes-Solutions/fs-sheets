"""Print the first worksheet of an .xlsx file as JSON {"rows": [[...], ...]} (cached values only).
Never evaluates formulas, macros or links. Usage: python read_table.py file.xlsx"""
import sys, json, datetime
import openpyxl

def value(v):
    if isinstance(v, datetime.datetime):
        return v.date().isoformat() if v.time() == datetime.time(0) else v.isoformat(timespec='minutes')
    if isinstance(v, datetime.date):
        return v.isoformat()
    return v if v is not None else ''

wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
ws = wb.worksheets[0]
rows = []
for row in ws.iter_rows(values_only=True):
    rows.append([value(v) for v in row])
    if len(rows) > 20001:
        break
json.dump({"rows": rows}, sys.stdout)
