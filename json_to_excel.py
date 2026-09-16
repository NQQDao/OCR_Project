# json_to_excel_v2.py
# OCR_Project - JSON -> Excel theo mẫu phiếu NHẬT KÝ XE GỖ
# Chỉ xử lý 1 JSON mỗi lần. Không ghi đè Excel cũ.
# Excel xuất vào thư mục excel_exports của project

from __future__ import annotations
import json, re, sys
from pathlib import Path
from typing import Any
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, Side

BASE_DIR = Path(__file__).resolve().parent
JSON_DIR = BASE_DIR / "output"

# Excel xuất từ website
EXCEL_DIR = BASE_DIR / "excel_exports"


def txt(v: Any) -> str:
    return '' if v is None else str(v).strip()


def num(v: Any) -> float | None:
    if v is None or v == '': return None
    if isinstance(v, (int,float)): return float(v)
    s=txt(v).replace(' ','')
    if ',' in s and '.' not in s: s=s.replace(',','.')
    elif ',' in s and '.' in s: s=s.replace('.','').replace(',','.')
    s=re.sub(r'[^0-9.\-]','',s)
    try: return float(s)
    except ValueError: return None


def parse_dim(v: Any):
    # JSON ghi theo thứ tự Dày x Rộng x Dài = SL
    s=txt(v).lower().replace('×','x')
    n=re.findall(r'\d+(?:[.,]\d+)?',s)
    if len(n)<3: return None
    try:
        day=float(n[0].replace(',','.'))
        rong=float(n[1].replace(',','.'))
        dai=float(n[2].replace(',','.'))
        sl=int(round(float(n[3].replace(',','.')))) if len(n)>=4 else 1
        return dai,rong,day,sl
    except ValueError: return None


def unique_path(stem: str) -> Path:
    EXCEL_DIR.mkdir(parents=True, exist_ok=True)
    p=EXCEL_DIR/f'{stem}.xlsx'
    if not p.exists(): return p
    i=2
    while (EXCEL_DIR/f'{stem}_v{i}.xlsx').exists(): i+=1
    return EXCEL_DIR/f'{stem}_v{i}.xlsx'


def read_json(path: Path):
    with path.open('r',encoding='utf-8-sig') as f: d=json.load(f)
    if not isinstance(d,dict): raise ValueError('JSON cấp cao nhất phải là object')
    h=d.get('header') if isinstance(d.get('header'),dict) else {}
    items=d.get('items') if isinstance(d.get('items'),list) else []
    return {
        'so_xe':txt(h.get('so_xe') or d.get('so_xe') or d.get('bien_so_xe')),
        'ngay_xe':txt(h.get('ngay_xe') or d.get('ngay_xe')),
        'kich_thuoc_go_tron':txt(h.get('kich_thuoc_go_tron') or d.get('kich_thuoc_go_tron')),
        'khoi_luong_go_tron':txt(h.get('khoi_luong_go_tron') or d.get('khoi_luong_go_tron')),
        'kich_thuoc_xe':txt(h.get('kich_thuoc_xe') or d.get('kich_thuoc_xe')),
        'items':items,
    }


def create_excel(json_path: Path) -> Path:
    d=read_json(json_path)
    wb=Workbook(); ws=wb.active; ws.title='NHAT_KY_XE_GO'; ws.sheet_view.showGridLines=False
    thin=Side(style='thin',color='000000'); bd=Border(left=thin,right=thin,top=thin,bottom=thin)
    title=Font(name='Arial',size=14,bold=True); head=Font(name='Arial',size=10,bold=True); body=Font(name='Arial',size=10)
    bold=Font(name='Arial',size=10,bold=True)
    cen=Alignment(horizontal='center',vertical='center',wrap_text=True); lef=Alignment(horizontal='left',vertical='center',wrap_text=True)

    # Khung trái: thông tin gỗ tròn
    ws.merge_cells('A1:C1'); ws['A1']='THÔNG TIN GỖ TRÒN'; ws['A1'].font=head; ws['A1'].alignment=cen
    for r in range(1,9):
        for c in range(1,4): ws.cell(r,c).border=bd
    meta=[('Ngày xẻ:',d['ngay_xe']),('No:',d['so_xe']),('Kích thước gỗ tròn:',d['kich_thuoc_go_tron']),('Khối lượng:',d['khoi_luong_go_tron']),('Kích thước xẻ:',d['kich_thuoc_xe'])]
    for r,(lab,val) in enumerate(meta,2):
        ws.merge_cells(start_row=r,start_column=1,end_row=r,end_column=2)
        ws.cell(r,1,lab).font=bold; ws.cell(r,1).alignment=lef
        ws.cell(r,3,val).alignment=lef
        ws.cell(r,1).border=bd; ws.cell(r,3).border=bd

    # Tiêu đề chung
    ws.merge_cells('D1:O1'); ws['D1']='NHẬT KÝ XE GỖ TẠI:  THÔNG TIN GỖ THÀNH KHÍ'; ws['D1'].font=title; ws['D1'].alignment=cen
    ws['O2']='Tổng kết khối lượng\nxe cuối ngày'; ws['O2'].font=head; ws['O2'].alignment=cen
    headers=['Ngày/ Tháng/ Năm','STT','Kích thước và số lượng','Khối lượng\n(m³)','Công trình','STT','Tên cấu kiện','Dài\n(cm)','Rộng\n(cm)','Dày\n(cm)','SL']
    for c,h in enumerate(headers,4):
        ws.cell(2,c,h); ws.cell(2,c).font=head; ws.cell(2,c).alignment=cen; ws.cell(2,c).border=bd
    ws.row_dimensions[1].height=26; ws.row_dimensions[2].height=38

    start=3; rows=[]
    for i,item in enumerate(d['items'],1):
        raw=txt(item.get('kich_thuoc_so_luong') or item.get('kich_thuoc'))
        p=parse_dim(raw)
        dai,rong,day,sl=p if p else (None,None,None,None)
        written=num(item.get('khoi_luong') if item.get('khoi_luong') is not None else item.get('khoi_luong_m3'))
        rows.append((txt(item.get('ngay')),i,raw,written,txt(item.get('cong_trinh')),txt(item.get('stt_cau_kien')),txt(item.get('ten_cau_kien')),dai,rong,day,sl))
    for r, data_row in enumerate(rows, start):
        for c, value in enumerate(data_row, 4):
            cell = ws.cell(row=r, column=c, value=value)
            cell.font = body
            cell.alignment = cen
            cell.border = bd

    # Khối lượng ghi
        ws.cell(row=r, column=7).number_format = '0.000'
    end=start+len(rows)-1
    total=end+1
    ws.merge_cells(start_row=total,start_column=3,end_row=total,end_column=6)
    ws.cell(total,3,'TỔNG CỘNG').font=bold; ws.cell(total,3).alignment=cen
    for c in range(3,16): ws.cell(total,c).border=bd
    if rows:
        ws.cell(total,7,f'=SUM(G{start}:G{end})').number_format='0.000'; ws.cell(total,7).font=bold
        ws.cell(total,14,f'=SUM(N{start}:N{end})').font=bold

    # Tổng theo ngày và đưa tổng vào cột O, giống phiếu giấy
    groups=[]
    for day,*_ in rows:
        if day and day not in groups: groups.append(day)
    for day in groups:
        inds=[r for r in range(start,end+1) if ws.cell(r,4).value==day]
        if not inds: continue
        # merged date display only on first row of group
        first,last=inds[0],inds[-1]
        if last>first: ws.merge_cells(start_row=first,start_column=4,end_row=last,end_column=4)
        ws.cell(first,4,day).alignment=cen
        total_day=sum((num(ws.cell(r,7).value) or 0) for r in inds)
        if last>first: ws.merge_cells(start_row=first,start_column=15,end_row=last,end_column=15)
        ws.cell(first,15,round(total_day,3)); ws.cell(first,15).number_format='0.000'; ws.cell(first,15).alignment=cen
        for r in inds:
            ws.cell(r,4).border=bd; ws.cell(r,15).border=bd

    # Chữ ký
    sr=total+4
    for c,t in [(4,'XÁC NHẬN GHI CHÉP'),(8,'XÁC NHẬN NGƯỜI XE'),(12,'XÁC NHẬN QUẢN LÝ XƯỞNG')]:
        ws.merge_cells(start_row=sr,start_column=c,end_row=sr,end_column=c+2); ws.cell(sr,c,t).font=bold; ws.cell(sr,c).alignment=cen

    widths={'A':10,'B':10,'C':22,'D':14,'E':7,'F':27,'G':14,'H':25,'I':7,'J':18,'K':14,'L':10,'M':10,'N':8,'O':16}
    for col,w in widths.items(): ws.column_dimensions[col].width=w
    for r in range(3,total+1): ws.row_dimensions[r].height=30
    ws.freeze_panes='D3'; ws.page_setup.orientation='landscape'; ws.page_setup.fitToWidth=1; ws.page_setup.fitToHeight=0; ws.sheet_properties.pageSetUpPr.fitToPage=True
    ws.print_area=f'A1:O{sr}'
    out=unique_path(json_path.stem); wb.save(out); return out


def main():
    if len(sys.argv)!=2:
        print('Chi xu ly 1 JSON moi lan.')
        print(r'Vi du: .\.venv\Scripts\python.exe .\json_to_excel_v2.py mau_27_v51.json')
        return
    p=Path(sys.argv[1]); p=p if p.is_absolute() else JSON_DIR/p
    if not p.exists(): print(f'[LOI] Khong tim thay JSON: {p}'); return
    try:
        out=create_excel(p); print(f'[OK] {out}')
    except Exception as e: print(f'[LOI] {type(e).__name__}: {e}')

if __name__=='__main__': main()
