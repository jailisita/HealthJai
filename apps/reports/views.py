"""
Módulo de Reportes — SADA IPS
Exportación PDF, Excel, CSV con diseño visual de marca.
Soporta filtros: ?riesgo=alto&sexo=F&critico=true
"""
import io, csv
from datetime import datetime
from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from apps.etl.models import Paciente, HistorialETL

# ── Paleta de marca ──────────────────────────────────────────────────────────
try:
    from reportlab.lib import colors as rl_colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, KeepTogether
    )
    from reportlab.graphics.shapes import Drawing, Rect, String, Line
    from reportlab.graphics import renderPDF
    REPORTLAB_OK = True
except ImportError:
    REPORTLAB_OK = False

# Colores
C_VIOLET_900 = '#1a0533'
C_VIOLET_700 = '#4a1080'
C_VIOLET_600 = '#6520b0'
C_VIOLET_500 = '#7c3aed'
C_VIOLET_300 = '#a78bfa'
C_VIOLET_100 = '#ddd6fe'
C_VIOLET_50  = '#f5f3ff'
C_TEAL       = '#14b8a6'
C_TEAL_LIGHT = '#ccfbf1'
C_ROSE       = '#f43f5e'
C_ROSE_LIGHT = '#ffe4e6'
C_AMBER      = '#fbbf24'
C_AMBER_LIGHT= '#fef3c7'
C_GRAY_800   = '#1e1b29'
C_GRAY_500   = '#6b6489'
C_GRAY_200   = '#e4e2ed'
C_GRAY_50    = '#f8f7fc'
C_WHITE      = '#ffffff'

RIESGO_COLOR = {
    'bajo':    C_TEAL,
    'medio':   C_AMBER,
    'alto':    '#f97316',
    'critico': C_ROSE,
}
RIESGO_BG = {
    'bajo':    C_TEAL_LIGHT,
    'medio':   C_AMBER_LIGHT,
    'alto':    '#ffedd5',
    'critico': C_ROSE_LIGHT,
}


def _get_pacientes_filtrados(request):
    qs = Paciente.objects.all()
    riesgo  = request.GET.get('riesgo', '').strip().lower()
    sexo    = request.GET.get('sexo', '').strip().upper()
    critico = request.GET.get('critico', '').strip().lower()
    if riesgo  in ('bajo', 'medio', 'alto', 'critico'): qs = qs.filter(riesgo_enfermedad=riesgo)
    if sexo    in ('M', 'F'):                           qs = qs.filter(sexo=sexo)
    if critico == 'true':                               qs = qs.filter(es_critico=True)
    return qs


def _filtros_str(request):
    parts = []
    r = request.GET.get('riesgo', '').strip()
    s = request.GET.get('sexo',   '').strip()
    c = request.GET.get('critico','').strip().lower()
    if r: parts.append(f"Riesgo: {r.capitalize()}")
    if s: parts.append(f"Sexo: {'Masculino' if s.upper()=='M' else 'Femenino'}")
    if c == 'true': parts.append("Solo críticos")
    return " · ".join(parts) if parts else "Todos los pacientes"


# ════════════════════════════════════════════════════════════════════════════
#  CSV
# ════════════════════════════════════════════════════════════════════════════
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def exportar_csv(request):
    qs = _get_pacientes_filtrados(request)
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = 'attachment; filename="sada_ips_pacientes.csv"'
    response.write('\ufeff')  # BOM

    writer = csv.writer(response)
    # Fila de metadatos
    writer.writerow(['# SADA IPS — Reporte Clínico de Pacientes'])
    writer.writerow([f'# Generado: {datetime.now().strftime("%d/%m/%Y %H:%M")}'])
    writer.writerow([f'# Filtros: {_filtros_str(request)}'])
    writer.writerow([f'# Total registros: {qs.count()}'])
    writer.writerow([])

    campos = [
        'id_paciente','nombres','apellidos','edad','sexo','peso','altura',
        'imc','clasificacion_imc','presion_sistolica','presion_diastolica',
        'glucosa','colesterol','saturacion_oxigeno','temperatura',
        'diagnostico_preliminar','riesgo_enfermedad','es_critico','fecha_consulta'
    ]
    cabeceras = [
        'ID','Nombres','Apellidos','Edad','Sexo','Peso (kg)','Altura (m)',
        'IMC','Clasificación IMC','P. Sistólica','P. Diastólica',
        'Glucosa','Colesterol','Sat. Oxígeno','Temperatura',
        'Diagnóstico','Nivel de Riesgo','Es Crítico','Fecha Consulta'
    ]
    writer.writerow(cabeceras)
    for p in qs:
        writer.writerow([getattr(p, c, '') for c in campos])
    return response


# ════════════════════════════════════════════════════════════════════════════
#  EXCEL
# ════════════════════════════════════════════════════════════════════════════
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def exportar_excel(request):
    try:
        import openpyxl
        from openpyxl.styles import (Font, PatternFill, Alignment, Border, Side,
                                     GradientFill)
        from openpyxl.utils import get_column_letter
        from openpyxl.chart import BarChart, Reference
        from openpyxl.chart.series import SeriesLabel
    except ImportError:
        from rest_framework.response import Response
        return Response({'error': 'openpyxl no instalado'}, status=500)

    qs     = _get_pacientes_filtrados(request)
    fecha  = datetime.now().strftime('%d/%m/%Y %H:%M')
    filtro = _filtros_str(request)
    total  = qs.count()

    wb = openpyxl.Workbook()

    # ── Hoja 1: Portada ──────────────────────────────────────────────────────
    ws_cover = wb.active
    ws_cover.title = "Portada"
    ws_cover.sheet_view.showGridLines = False
    ws_cover.column_dimensions['A'].width = 3
    ws_cover.column_dimensions['B'].width = 28
    ws_cover.column_dimensions['C'].width = 28

    # Fondo morado en bloque superior
    violet_fill  = PatternFill("solid", fgColor="1a0533")
    violet2_fill = PatternFill("solid", fgColor="4a1080")
    white_fill   = PatternFill("solid", fgColor="FFFFFF")
    soft_fill    = PatternFill("solid", fgColor="f5f3ff")

    for row in range(1, 16):
        for col in range(1, 10):
            ws_cover.cell(row=row, column=col).fill = violet_fill

    for row in range(16, 40):
        for col in range(1, 10):
            ws_cover.cell(row=row, column=col).fill = white_fill

    # Título
    ws_cover.merge_cells('B3:H3')
    t = ws_cover['B3']
    t.value = 'SADA IPS'
    t.font  = Font(name='Calibri', size=28, bold=True, color='FFFFFF')
    t.alignment = Alignment(horizontal='left', vertical='center')

    ws_cover.merge_cells('B4:H4')
    s = ws_cover['B4']
    s.value = 'Plataforma de Analítica Clínica'
    s.font  = Font(name='Calibri', size=13, color='c4b5fd')
    s.alignment = Alignment(horizontal='left')

    ws_cover.merge_cells('B6:H6')
    r = ws_cover['B6']
    r.value = 'REPORTE CLÍNICO DE PACIENTES'
    r.font  = Font(name='Calibri', size=16, bold=True, color='a78bfa')
    r.alignment = Alignment(horizontal='left')

    ws_cover.row_dimensions[3].height = 36
    ws_cover.row_dimensions[4].height = 22
    ws_cover.row_dimensions[6].height = 28

    # Línea divisora (simulada con fill)
    for col in range(2, 9):
        ws_cover.cell(row=8, column=col).fill = PatternFill("solid", fgColor="6520b0")
    ws_cover.row_dimensions[8].height = 3

    # Metadatos en bloque inferior
    meta_rows = [
        ('Fecha de generación', fecha),
        ('Filtros aplicados',   filtro),
        ('Total de registros',  str(total)),
        ('Generado por',        'SADA IPS Analytics Engine'),
    ]
    for i, (k, v) in enumerate(meta_rows, start=18):
        ws_cover.row_dimensions[i].height = 22
        kc = ws_cover.cell(row=i, column=2, value=k)
        kc.font = Font(name='Calibri', size=10, bold=True, color='4a1080')
        kc.fill = soft_fill
        vc = ws_cover.cell(row=i, column=3, value=v)
        vc.font = Font(name='Calibri', size=10, color='1e1b29')
        vc.fill = soft_fill

    # ── Hoja 2: Pacientes ─────────────────────────────────────────────────────
    ws = wb.create_sheet("Pacientes")
    ws.sheet_view.showGridLines = False
    ws.freeze_panes = 'A3'

    # Fila 1: barra de título
    ws.merge_cells('A1:S1')
    title_cell = ws['A1']
    title_cell.value = f'SADA IPS — Pacientes  |  {filtro}  |  {total} registros  |  {fecha}'
    title_cell.font  = Font(name='Calibri', size=10, bold=True, color='FFFFFF')
    title_cell.fill  = PatternFill("solid", fgColor="4a1080")
    title_cell.alignment = Alignment(horizontal='left', vertical='center', indent=1)
    ws.row_dimensions[1].height = 22

    headers = [
        'ID', 'Nombres', 'Apellidos', 'Edad', 'Sexo',
        'Peso\n(kg)', 'Altura\n(m)', 'IMC', 'Clasif. IMC',
        'P. Sist.', 'P. Diast.', 'Glucosa', 'Colesterol',
        'Sat. O₂', 'Temp.', 'Diagnóstico', 'Riesgo', 'Crítico', 'Fecha'
    ]
    col_widths = [8, 16, 16, 6, 6, 8, 8, 7, 14, 9, 9, 9, 10, 8, 7, 22, 10, 8, 14]

    thin  = Side(style='thin',   color='e4e2ed')
    thick = Side(style='medium', color='6520b0')
    hdr_border = Border(bottom=thick)
    cell_border = Border(
        left=Side(style='thin', color='ede9fe'),
        right=Side(style='thin', color='ede9fe'),
        bottom=Side(style='thin', color='ede9fe')
    )

    # Cabecera fila 2
    for col_idx, (hdr, width) in enumerate(zip(headers, col_widths), 1):
        c = ws.cell(row=2, column=col_idx, value=hdr)
        c.font      = Font(name='Calibri', size=9, bold=True, color='FFFFFF')
        c.fill      = PatternFill("solid", fgColor="6520b0")
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        c.border    = hdr_border
        ws.column_dimensions[get_column_letter(col_idx)].width = width
    ws.row_dimensions[2].height = 30

    # Filas de datos
    RIESGO_XL = {
        'bajo':    ('14b8a6', 'ccfbf1'),
        'medio':   ('d97706', 'fef3c7'),
        'alto':    ('f97316', 'ffedd5'),
        'critico': ('dc2626', 'ffe4e6'),
    }
    for row_idx, p in enumerate(qs, 3):
        row_fill = PatternFill("solid", fgColor='FFFFFF' if row_idx % 2 == 0 else 'faf9ff')
        vals = [
            p.id_paciente, p.nombres, p.apellidos, p.edad, p.sexo,
            p.peso, p.altura,
            round(p.imc, 1) if p.imc else None,
            (p.clasificacion_imc or '').replace('_', ' ').title() if p.clasificacion_imc else None,
            p.presion_sistolica, p.presion_diastolica, p.glucosa,
            p.colesterol, p.saturacion_oxigeno, p.temperatura,
            p.diagnostico_preliminar, p.riesgo_enfermedad,
            'Sí' if p.es_critico else 'No',
            str(p.fecha_consulta)[:10] if p.fecha_consulta else ''
        ]
        for col_idx, val in enumerate(vals, 1):
            c = ws.cell(row=row_idx, column=col_idx, value=val)
            c.font      = Font(name='Calibri', size=9)
            c.alignment = Alignment(vertical='center', horizontal='center' if col_idx in (1,4,5,17,18) else 'left')
            c.fill      = row_fill
            c.border    = cell_border

        # Colorear riesgo
        riesgo_key = (p.riesgo_enfermedad or 'bajo').lower()
        fg, bg = RIESGO_XL.get(riesgo_key, ('555555', 'f0eef8'))
        rc = ws.cell(row=row_idx, column=17)
        rc.font = Font(name='Calibri', size=9, bold=True, color=fg)
        rc.fill = PatternFill("solid", fgColor=bg)
        rc.value = (p.riesgo_enfermedad or '').upper()

        # Resaltar crítico
        if p.es_critico:
            cc = ws.cell(row=row_idx, column=18)
            cc.font = Font(name='Calibri', size=9, bold=True, color='dc2626')
            cc.fill = PatternFill("solid", fgColor='ffe4e6')

        ws.row_dimensions[row_idx].height = 16

    # ── Hoja 3: Resumen ───────────────────────────────────────────────────────
    ws_r = wb.create_sheet("Resumen")
    ws_r.sheet_view.showGridLines = False

    # Header
    ws_r.merge_cells('A1:E1')
    h = ws_r['A1']
    h.value = 'SADA IPS — Resumen Estadístico'
    h.font  = Font(name='Calibri', size=14, bold=True, color='FFFFFF')
    h.fill  = PatternFill("solid", fgColor="4a1080")
    h.alignment = Alignment(horizontal='left', vertical='center', indent=1)
    ws_r.row_dimensions[1].height = 28

    # KPIs
    from apps.etl.models import Paciente as P
    criticos_n  = qs.filter(es_critico=True).count()
    hiperten_n  = qs.filter(presion_sistolica__gt=140).count()
    diabetico_n = qs.filter(glucosa__gt=126).count()
    kpis = [
        ('Total pacientes',       total,       '4a1080', 'f5f3ff'),
        ('Pacientes críticos',    criticos_n,  'dc2626', 'ffe4e6'),
        ('Hipertensos (Sist>140)',hiperten_n,  'f97316', 'ffedd5'),
        ('Diabéticos (Gluc>126)', diabetico_n, 'd97706', 'fef3c7'),
    ]
    ws_r.column_dimensions['A'].width = 2
    for i, (lbl, val, fg, bg) in enumerate(kpis, 3):
        ws_r.row_dimensions[i].height = 28
        lc = ws_r.cell(row=i, column=2, value=lbl)
        lc.font = Font(name='Calibri', size=10, color='4a4564')
        lc.fill = PatternFill("solid", fgColor=bg)
        lc.alignment = Alignment(vertical='center', indent=1)
        vc = ws_r.cell(row=i, column=3, value=val)
        vc.font = Font(name='Calibri', size=14, bold=True, color=fg)
        vc.fill = PatternFill("solid", fgColor=bg)
        vc.alignment = Alignment(horizontal='center', vertical='center')
        ws_r.column_dimensions['B'].width = 28
        ws_r.column_dimensions['C'].width = 12

    # Distribución por riesgo
    ws_r.row_dimensions[8].height = 20
    ws_r.cell(row=8, column=2).value = 'Distribución por Nivel de Riesgo'
    ws_r.cell(row=8, column=2).font = Font(name='Calibri', size=10, bold=True, color='4a1080')

    dist_headers = ['Nivel', 'Cantidad', '% del Total']
    for ci, h in enumerate(dist_headers, 2):
        c = ws_r.cell(row=9, column=ci, value=h)
        c.font = Font(name='Calibri', size=9, bold=True, color='FFFFFF')
        c.fill = PatternFill("solid", fgColor="6520b0")
        c.alignment = Alignment(horizontal='center', vertical='center')
    ws_r.row_dimensions[9].height = 18

    niveles = ['bajo', 'medio', 'alto', 'critico']
    for ri, nivel in enumerate(niveles, 10):
        cnt = qs.filter(riesgo_enfermedad=nivel).count()
        pct = round(cnt / total * 100, 1) if total else 0
        fg, bg = RIESGO_XL.get(nivel, ('555555', 'f5f3ff'))
        ws_r.row_dimensions[ri].height = 18
        nc = ws_r.cell(row=ri, column=2, value=nivel.capitalize())
        nc.font = Font(name='Calibri', size=9, bold=True, color=fg)
        nc.fill = PatternFill("solid", fgColor=bg)
        nc.alignment = Alignment(horizontal='center', vertical='center')
        cc = ws_r.cell(row=ri, column=3, value=cnt)
        cc.font = Font(name='Calibri', size=9)
        cc.fill = PatternFill("solid", fgColor='faf9ff')
        cc.alignment = Alignment(horizontal='center')
        pc = ws_r.cell(row=ri, column=4, value=f'{pct}%')
        pc.font = Font(name='Calibri', size=9)
        pc.fill = PatternFill("solid", fgColor='faf9ff')
        pc.alignment = Alignment(horizontal='center')
        ws_r.column_dimensions['D'].width = 12

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    response = HttpResponse(
        buffer.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = 'attachment; filename="sada_ips_reporte.xlsx"'
    return response


# ════════════════════════════════════════════════════════════════════════════
#  HISTORIAL ETL
# ════════════════════════════════════════════════════════════════════════════
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def historial_etl_reporte(request):
    from rest_framework.response import Response
    from apps.etl.serializers import HistorialETLSerializer
    data = HistorialETLSerializer(HistorialETL.objects.all()[:50], many=True).data
    return Response(data)


# ════════════════════════════════════════════════════════════════════════════
#  PDF
# ════════════════════════════════════════════════════════════════════════════
def _rl(hex_str):
    """Convierte hex a color de ReportLab."""
    h = hex_str.lstrip('#')
    return rl_colors.HexColor('#' + h)


def _build_header_canvas(canvas, doc):
    """Dibuja header y footer en cada página."""
    canvas.saveState()
    w, h = A4

    # ── Header barra morada ──────────────────────────────────────────────────
    canvas.setFillColor(_rl(C_VIOLET_700))
    canvas.rect(0, h - 40*mm, w, 40*mm, fill=1, stroke=0)

    # Acento teal (línea inferior del header)
    canvas.setFillColor(_rl(C_TEAL))
    canvas.rect(0, h - 41*mm, w, 1.5*mm, fill=1, stroke=0)

    # Icono corazón (símbolo "+" médico simulado)
    canvas.setFillColor(_rl(C_VIOLET_600))
    canvas.roundRect(14*mm, h - 34*mm, 18*mm, 18*mm, 4*mm, fill=1, stroke=0)
    canvas.setFillColor(rl_colors.white)
    canvas.setFont('Helvetica-Bold', 16)
    canvas.drawCentredString(23*mm, h - 28*mm, '+')

    # Nombre empresa
    canvas.setFillColor(rl_colors.white)
    canvas.setFont('Helvetica-Bold', 16)
    canvas.drawString(36*mm, h - 22*mm, 'SADA IPS')
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(_rl(C_VIOLET_300))
    canvas.drawString(36*mm, h - 29*mm, 'Plataforma de Analítica Clínica')

    # Fecha y página (derecha)
    fecha = datetime.now().strftime('%d/%m/%Y %H:%M')
    canvas.setFont('Helvetica', 7.5)
    canvas.setFillColor(_rl(C_VIOLET_300))
    canvas.drawRightString(w - 14*mm, h - 22*mm, f'Generado: {fecha}')
    canvas.drawRightString(w - 14*mm, h - 29*mm, f'Página {doc.page}')

    # ── Footer ───────────────────────────────────────────────────────────────
    canvas.setFillColor(_rl(C_GRAY_200))
    canvas.rect(0, 0, w, 12*mm, fill=1, stroke=0)
    canvas.setFillColor(_rl(C_VIOLET_500))
    canvas.rect(0, 12*mm, w, 0.5*mm, fill=1, stroke=0)
    canvas.setFont('Helvetica', 7)
    canvas.setFillColor(_rl(C_GRAY_500))
    canvas.drawString(14*mm, 4.5*mm, 'SADA IPS · Reporte Clínico Confidencial · Uso interno')
    canvas.drawRightString(w - 14*mm, 4.5*mm, '© 2025 SADA IPS. Todos los derechos reservados.')

    canvas.restoreState()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def exportar_pdf(request):
    if not REPORTLAB_OK:
        from rest_framework.response import Response
        return Response({'error': 'reportlab no instalado'}, status=500)

    qs     = _get_pacientes_filtrados(request)
    total  = qs.count()
    filtro = _filtros_str(request)
    fecha  = datetime.now().strftime('%d/%m/%Y %H:%M')

    # Filtros query raw
    riesgo_q  = request.GET.get('riesgo',  '').strip()
    sexo_q    = request.GET.get('sexo',    '').strip()
    critico_q = request.GET.get('critico', '').strip().lower()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=14*mm, rightMargin=14*mm,
        topMargin=46*mm, bottomMargin=18*mm,
        title='SADA IPS — Reporte Clínico',
        author='SADA IPS Analytics',
    )

    # ── Estilos ──────────────────────────────────────────────────────────────
    def style(name, **kw):
        return ParagraphStyle(name=name, fontName=kw.pop('font','Helvetica'),
                              fontSize=kw.pop('size',10), **kw)

    S_SECTION = style('sec', font='Helvetica-Bold', size=10,
                      textColor=_rl(C_VIOLET_700), spaceBefore=10, spaceAfter=5)
    S_CELL    = style('cell', size=7.5, leading=10, textColor=_rl(C_GRAY_800))
    S_CELLB   = style('cellb', font='Helvetica-Bold', size=7.5, leading=10, textColor=_rl(C_VIOLET_700))
    S_HDR     = style('hdr', font='Helvetica-Bold', size=7.5, leading=10,
                      textColor=rl_colors.white)
    S_META    = style('meta', size=8, leading=12, textColor=_rl(C_GRAY_500))

    story = []

    # ── Bloque de info del reporte ───────────────────────────────────────────
    meta_data = [
        [Paragraph('<b>Filtros aplicados</b>', S_CELLB), Paragraph(filtro, S_CELL),
         Paragraph('<b>Total registros</b>', S_CELLB),   Paragraph(str(total), S_CELL)],
    ]
    meta_tbl = Table(meta_data, colWidths=[38*mm, 68*mm, 35*mm, 22*mm])
    meta_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), _rl(C_VIOLET_50)),
        ('BOX',        (0,0), (-1,-1), 0.8, _rl(C_VIOLET_100)),
        ('PADDING',    (0,0), (-1,-1), 5),
        ('VALIGN',     (0,0), (-1,-1), 'MIDDLE'),
        ('ROUNDEDCORNERS', [4]),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 5*mm))

    # ── KPI cards ────────────────────────────────────────────────────────────
    criticos_n  = qs.filter(es_critico=True).count()
    hiperten_n  = qs.filter(presion_sistolica__gt=140).count()
    diabetico_n = qs.filter(glucosa__gt=126).count()

    def kpi_cell(label, value, fg, bg):
        return [
            Paragraph(f'<font color="{fg}"><b>{value}</b></font>', style('kv', size=18, leading=20, textColor=_rl(fg))),
            Paragraph(label, style('kl', size=7, leading=9, textColor=_rl(C_GRAY_500))),
        ]

    kpi_data = [[
        Table([kpi_cell('Total pacientes',       total,       C_VIOLET_600, C_VIOLET_50)],  colWidths=[40*mm]),
        Table([kpi_cell('Pacientes críticos',    criticos_n,  C_ROSE,       C_ROSE_LIGHT)], colWidths=[40*mm]),
        Table([kpi_cell('Hipertensos',           hiperten_n,  '#f97316',    '#ffedd5')],    colWidths=[40*mm]),
        Table([kpi_cell('Diabéticos',            diabetico_n, C_AMBER,      C_AMBER_LIGHT)],colWidths=[40*mm]),
    ]]

    BG = [C_VIOLET_50, C_ROSE_LIGHT, '#ffedd5', C_AMBER_LIGHT]
    BD = [C_VIOLET_100, '#fecdd3', '#fed7aa', '#fde68a']
    kpi_tbl = Table(kpi_data, colWidths=[43*mm]*4, hAlign='LEFT')
    kpi_tbl.setStyle(TableStyle([
        *[('BACKGROUND', (i,0), (i,0), _rl(BG[i])) for i in range(4)],
        *[('BOX',        (i,0), (i,0), 0.8, _rl(BD[i])) for i in range(4)],
        ('PADDING',  (0,0), (-1,-1), 8),
        ('VALIGN',   (0,0), (-1,-1), 'MIDDLE'),
        ('COLPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(kpi_tbl)
    story.append(Spacer(1, 6*mm))

    # ── Distribución por riesgo (tabla compacta) ─────────────────────────────
    story.append(Paragraph('Distribución por Nivel de Riesgo', S_SECTION))

    dist_hdr = [Paragraph(h, S_HDR) for h in ['Nivel', 'Cantidad', '% del total', 'Indicador']]
    dist_rows = [dist_hdr]
    niveles = ['bajo', 'medio', 'alto', 'critico']
    for nivel in niveles:
        cnt = qs.filter(riesgo_enfermedad=nivel).count()
        pct = round(cnt / total * 100, 1) if total else 0
        fc  = RIESGO_COLOR.get(nivel, C_GRAY_500)
        bar_width = int(pct * 0.6)
        bar = '█' * bar_width + '░' * max(0, 60 - bar_width)
        dist_rows.append([
            Paragraph(f'<font color="{fc}"><b>{nivel.upper()}</b></font>', S_CELL),
            Paragraph(str(cnt), S_CELL),
            Paragraph(f'{pct}%', S_CELL),
            Paragraph(f'<font color="{fc}">{bar[:30]}</font>', style('bar', size=5, leading=7)),
        ])

    dist_tbl = Table(dist_rows, colWidths=[28*mm, 24*mm, 28*mm, 83*mm])
    dist_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), _rl(C_VIOLET_600)),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [rl_colors.white, _rl('#faf9ff')]),
        ('GRID',   (0,0), (-1,-1), 0.4, _rl(C_GRAY_200)),
        ('PADDING',(0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(dist_tbl)
    story.append(Spacer(1, 6*mm))

    # ── Tabla principal de pacientes ─────────────────────────────────────────
    story.append(Paragraph(f'Listado de Pacientes — {total} registros', S_SECTION))

    col_headers = ['ID', 'Nombre Completo', 'Edad', 'Sx', 'IMC', 'Glucosa',
                   'P.Sist.', 'Diagnóstico', 'Riesgo', 'Crít.']
    col_w       = [14*mm, 44*mm, 11*mm, 8*mm, 12*mm, 14*mm, 13*mm, 38*mm, 16*mm, 10*mm]

    tbl_data = [[Paragraph(h, S_HDR) for h in col_headers]]

    for p in qs:
        rk     = (p.riesgo_enfermedad or 'bajo').lower()
        fc     = RIESGO_COLOR.get(rk, C_GRAY_500)
        nombre = f"{p.nombres or ''} {p.apellidos or ''}".strip()
        imc_s  = f"{p.imc:.1f}" if p.imc else '—'

        tbl_data.append([
            Paragraph(str(p.id_paciente), S_CELL),
            Paragraph(nombre, S_CELL),
            Paragraph(str(p.edad or '—'), S_CELL),
            Paragraph(str(p.sexo or '—'), S_CELL),
            Paragraph(imc_s, S_CELL),
            Paragraph(str(p.glucosa or '—'), S_CELL),
            Paragraph(str(p.presion_sistolica or '—'), S_CELL),
            Paragraph(str(p.diagnostico_preliminar or '—'), S_CELL),
            Paragraph(f'<font color="{fc}"><b>{rk.upper()}</b></font>', S_CELL),
            Paragraph('<font color="#dc2626"><b>✓</b></font>' if p.es_critico else '—', S_CELL),
        ])

    pac_tbl = Table(tbl_data, colWidths=col_w, repeatRows=1)

    row_styles = [
        ('BACKGROUND',    (0,0),  (-1,0),  _rl(C_VIOLET_600)),
        ('ROWBACKGROUNDS',(0,1),  (-1,-1), [rl_colors.white, _rl('#faf9ff')]),
        ('GRID',          (0,0),  (-1,-1), 0.3, _rl(C_GRAY_200)),
        ('PADDING',       (0,0),  (-1,-1), 4),
        ('VALIGN',        (0,0),  (-1,-1), 'MIDDLE'),
        ('ALIGN',         (0,0),  (-1,-1), 'LEFT'),
        ('ALIGN',         (0,0),  (0,-1),  'CENTER'),
        ('ALIGN',         (2,0),  (3,-1),  'CENTER'),
        ('ALIGN',         (9,0),  (9,-1),  'CENTER'),
    ]

    # Resaltar filas críticas con fondo rose muy suave
    for row_idx, p in enumerate(qs, 1):
        if p.es_critico:
            row_styles.append(('BACKGROUND', (0,row_idx), (-1,row_idx), _rl('#fff5f7')))

    pac_tbl.setStyle(TableStyle(row_styles))
    story.append(pac_tbl)

    doc.build(story, onFirstPage=_build_header_canvas, onLaterPages=_build_header_canvas)
    buffer.seek(0)

    response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = 'attachment; filename="sada_ips_reporte_clinico.pdf"'
    return response
