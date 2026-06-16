import os
import threading
from django.conf import settings
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.authentication.permissions import EsMedico, EsAdministrador, EsAnalista
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiExample
from drf_spectacular.types import OpenApiTypes
from .models import Paciente, HistorialETL
from .serializers import PacienteSerializer, HistorialETLSerializer
from .etl_engine import ejecutar_etl
from django.db.models import Q




class PacienteViewSet(viewsets.ModelViewSet):
    """
    CRUD de pacientes. Lectura: admin/médico. Escritura: solo admin.
    """
    queryset = Paciente.objects.all()
    serializer_class = PacienteSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), EsAdministrador()]
        return [IsAuthenticated(), EsMedico()]

    @extend_schema(
        tags=['pacientes'],
        parameters=[
            OpenApiParameter('riesgo', OpenApiTypes.STR,
                             description='Filtrar por nivel de riesgo: bajo, medio, alto, critico'),
            OpenApiParameter('sexo', OpenApiTypes.STR,
                             description='Filtrar por sexo: M, F'),
            OpenApiParameter('critico', OpenApiTypes.STR,
                             description='Solo pacientes críticos: true'),
        ],
        summary='Listar pacientes',
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        qs = super().get_queryset()
        riesgo  = self.request.query_params.get('riesgo')
        critico = self.request.query_params.get('critico')
        sexo    = self.request.query_params.get('sexo')
        busqueda = self.request.query_params.get('busqueda')

        if riesgo:
            qs = qs.filter(riesgo_enfermedad=riesgo)
        if critico == 'true':
            qs = qs.filter(es_critico=True)
        if sexo:
            qs = qs.filter(sexo=sexo)

        # Búsqueda global (en todos los registros)
        # - Texto: nombres/apellidos/diagnóstico (contains case-insensitive)
        # - ID: si la búsqueda es numérica
        if busqueda:
            b = busqueda.strip()
            if b:
                filtro = (
                    Q(nombres__icontains=b) |
                    Q(apellidos__icontains=b) |
                    Q(diagnostico_preliminar__icontains=b)
                )

                if b.isdigit():
                    filtro |= Q(id_paciente__exact=int(b))

                qs = qs.filter(filtro)

        return qs

    def perform_update(self, serializer):
        data = self.request.data
        if 'peso' in data or 'altura' in data:
            peso = data.get('peso', getattr(serializer.instance, 'peso', None))
            altura = data.get('altura', getattr(serializer.instance, 'altura', None))
            if peso and altura:
                try:
                    imc = float(peso) / (float(altura) ** 2)
                    serializer.validated_data['imc'] = round(imc, 1)
                    if imc < 18.5:
                        serializer.validated_data['clasificacion_imc'] = 'bajo_peso'
                    elif imc < 25:
                        serializer.validated_data['clasificacion_imc'] = 'normal'
                    elif imc < 30:
                        serializer.validated_data['clasificacion_imc'] = 'sobrepeso'
                    else:
                        serializer.validated_data['clasificacion_imc'] = 'obesidad'
                except (ValueError, TypeError):
                    pass
        campos_critico = ['presion_sistolica', 'glucosa', 'saturacion_oxigeno', 'riesgo_enfermedad']
        if any(c in data for c in campos_critico):
            instance = serializer.instance
            ps = data.get('presion_sistolica', instance.presion_sistolica)
            gluc = data.get('glucosa', instance.glucosa)
            sat = data.get('saturacion_oxigeno', instance.saturacion_oxigeno)
            riesgo = data.get('riesgo_enfermedad', instance.riesgo_enfermedad)
            critico = False
            if ps and float(ps) > 180:
                critico = True
            if gluc and float(gluc) > 300:
                critico = True
            if sat and float(sat) < 85:
                critico = True
            if riesgo and riesgo == 'critico':
                critico = True
            serializer.validated_data['es_critico'] = critico
        serializer.save()


@extend_schema(
    tags=['etl'],
    summary='Ejecutar proceso ETL',
    description='Ejecuta Extract → Transform → Load sobre el dataset clínico almacenado en el servidor.',
    responses={200: HistorialETLSerializer},
)
@api_view(['POST'])
@permission_classes([IsAuthenticated, EsAnalista])
def ejecutar_etl_view(request):
    filepath = str(settings.BASE_DIR / 'datasets' / 'dataset_clinico.xlsx')
    if not os.path.exists(filepath):
        # Intentar con .csv
        filepath_csv = str(settings.BASE_DIR / 'datasets' / 'dataset_clinico.csv')
        if os.path.exists(filepath_csv):
            filepath = filepath_csv
        else:
            return Response(
                {'error': 'Dataset no encontrado. Sube un archivo primero usando /api/etl/upload/'},
                status=status.HTTP_404_NOT_FOUND
            )
    historial = ejecutar_etl(filepath, usuario=request.user)
    return Response(HistorialETLSerializer(historial).data)


def _procesar_upload_async(destino, user_id):
    import django
    django.setup()
    from django.contrib.auth import get_user_model
    try:
        user = get_user_model().objects.get(pk=user_id)
        ejecutar_etl(destino, usuario=user)
    except Exception:
        pass

@extend_schema(
    tags=['etl'],
    summary='Subir dataset y ejecutar ETL',
    description='Sube un archivo CSV o Excel. El proceso ETL se ejecuta automáticamente.',
    responses={200: HistorialETLSerializer},
)
@api_view(['POST'])
@permission_classes([IsAuthenticated, EsAnalista])
@parser_classes([MultiPartParser])
def subir_dataset(request):
    try:
        archivo = request.FILES.get('archivo')
        if not archivo:
            return Response({'error': 'No se envió archivo'}, status=status.HTTP_400_BAD_REQUEST)

        os.makedirs(settings.MEDIA_ROOT / 'etl_uploads', exist_ok=True)
        ext = os.path.splitext(archivo.name)[1].lower()
        if ext not in ['.csv', '.xlsx', '.xls']:
            return Response(
                {'error': 'Formato no soportado. Use CSV o Excel (.csv, .xlsx, .xls)'},
                status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
            )

        destino = settings.MEDIA_ROOT / 'etl_uploads' / f'uploaded{ext}'
        with open(destino, 'wb') as f:
            for chunk in archivo.chunks():
                f.write(chunk)

        hilo = threading.Thread(
            target=_procesar_upload_async,
            args=(destino, request.user.pk),
            daemon=True,
        )
        hilo.start()

        return Response(
            {'mensaje': 'Archivo subido. El ETL se está procesando en segundo plano.'},
            status=status.HTTP_202_ACCEPTED,
        )

    except Exception as e:
        detalle = str(e)
        error_tipo = e.__class__.__name__
        return Response(
            {
                'error': 'Fallo al subir o procesar el archivo',
                'detalle': detalle,
                'tipo': error_tipo,
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )



@extend_schema(
    tags=['etl'],
    summary='Historial de ejecuciones ETL',
    responses={200: HistorialETLSerializer(many=True)},
)
@api_view(['GET'])
@permission_classes([IsAuthenticated, EsAnalista])
def historial_etl(request):
    registros = HistorialETL.objects.all()[:20]
    return Response(HistorialETLSerializer(registros, many=True).data)
