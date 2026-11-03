"""Write an .xlsx file from the workbook description built by lib/excel-export.mjs.

Usage: python export_xlsx.py spec.json out.xlsx
Formulas are written as Excel formulas (Excel recalculates on open). Styles are cached so large
sheets stay fast. Row hierarchy becomes Excel outline levels (summary rows above details).
"""
import json
import sys
from datetime import date

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HEADER_FONT = Font(bold=True, color="1D1D1F")
HEADER_FILL = PatternFill("solid", fgColor="EDEDEF")


def main(spec_path, out_path):
    with open(spec_path, encoding="utf-8") as fh:
        spec = json.load(fh)
    wb = Workbook()
    wb.remove(wb.active)
    fonts, fills, aligns = {}, {}, {}

    def font_for(fmt):
        key = (fmt.get("b"), fmt.get("i"), fmt.get("u"), fmt.get("s"), fmt.get("color"), fmt.get("size"))
        if key not in fonts:
            fonts[key] = Font(bold=bool(fmt.get("b")), italic=bool(fmt.get("i")), underline="single" if fmt.get("u") else None,
                              strike=bool(fmt.get("s")), color=("FF" + fmt["color"]) if fmt.get("color") else None, size=fmt.get("size"))
        return fonts[key]

    def fill_for(color):
        if color not in fills:
            fills[color] = PatternFill("solid", fgColor="FF" + color)
        return fills[color]

    def align_for(fmt):
        key = (fmt.get("align"), bool(fmt.get("wrap")))
        if key not in aligns:
            aligns[key] = Alignment(horizontal=fmt.get("align"), wrap_text=bool(fmt.get("wrap")), vertical="top" if fmt.get("wrap") else None)
        return aligns[key]

    for sheet in spec["sheets"]:
        ws = wb.create_sheet(sheet["title"])
        ws.sheet_properties.outlinePr.summaryBelow = False
        for ci, col in enumerate(sheet["columns"], start=1):
            cell = ws.cell(row=1, column=ci, value=col["header"])
            cell.font, cell.fill = HEADER_FONT, HEADER_FILL
            dim = ws.column_dimensions[get_column_letter(ci)]
            dim.width = col["width"]
            dim.hidden = bool(col.get("hidden"))
        formats = [c.get("numFmt") for c in sheet["columns"]]
        for ri, row in enumerate(sheet["rows"], start=2):
            if row.get("level"):
                ws.row_dimensions[ri].outline_level = min(7, row["level"])
            for ci, data in enumerate(row["cells"], start=1):
                if not data:
                    continue
                if "f" in data:
                    value = data["f"]
                elif data.get("t") == "d":
                    y, m, d = (int(x) for x in data["v"].split("-"))
                    value = date(y, m, d)
                else:
                    value = data.get("v")
                if value is None and not data.get("fmt") and not data.get("note"):
                    continue
                cell = ws.cell(row=ri, column=ci, value=value)
                if formats[ci - 1] and (data.get("t") in ("n", "d") or "f" in data):
                    cell.number_format = formats[ci - 1]
                fmt = data.get("fmt")
                if fmt:
                    if any(k in fmt for k in ("b", "i", "u", "s", "color", "size")):
                        cell.font = font_for(fmt)
                    if fmt.get("fill"):
                        cell.fill = fill_for(fmt["fill"])
                    if fmt.get("align") or fmt.get("wrap"):
                        cell.alignment = align_for(fmt)
                if data.get("link"):
                    cell.hyperlink = data["link"]
                if data.get("note"):
                    cell.comment = Comment(data["note"], "sheets")
        freeze = sheet.get("freeze") or {}
        ws.freeze_panes = ws.cell(row=freeze.get("row", 2), column=freeze.get("col", 1))
    if not spec["sheets"]:
        wb.create_sheet("Empty")
    wb.save(out_path)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
