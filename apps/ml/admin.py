from django.contrib import admin
from .models import ModeloML, PrediccionPaciente

@admin.register(ModeloML)
class ModeloMLAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'algoritmo', 'accuracy', 'activo', 'fecha_entrenamiento']
    list_filter = ['algoritmo', 'activo']

@admin.register(PrediccionPaciente)
class PrediccionPacienteAdmin(admin.ModelAdmin):
    list_display = ['paciente', 'modelo', 'riesgo_predicho', 'probabilidad_riesgo', 'fecha_prediccion']
    list_filter = ['riesgo_predicho']
