from django.contrib import admin
from .models import EstadisticaClinica

@admin.register(EstadisticaClinica)
class EstadisticaClinicaAdmin(admin.ModelAdmin):
    list_display = ['fecha_calculo', 'total_pacientes', 'riesgo_bajo', 'riesgo_medio',
                    'riesgo_alto', 'riesgo_critico']
    readonly_fields = ['fecha_calculo']
