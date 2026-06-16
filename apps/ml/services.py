import os
import pickle
import numpy as np
import pandas as pd
from django.conf import settings
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import (accuracy_score, precision_score,
                             recall_score, f1_score, confusion_matrix)
from apps.etl.models import Paciente
from .models import ModeloML, PrediccionPaciente

FEATURES = ['edad', 'imc', 'glucosa', 'colesterol', 'presion_sistolica',
            'presion_diastolica', 'frecuencia_cardiaca', 'saturacion_oxigeno',
            'temperatura', 'fumador', 'consumo_alcohol', 'antecedentes_familiares']

ALGORITMOS = {
    'logistic_regression': LogisticRegression(max_iter=500, random_state=42),
    'decision_tree': DecisionTreeClassifier(max_depth=8, random_state=42),
    'random_forest': RandomForestClassifier(n_estimators=100, random_state=42),
}


def _preparar_dataset():
    qs = Paciente.objects.exclude(riesgo_enfermedad__isnull=True)
    df = pd.DataFrame(list(qs.values(*FEATURES, 'riesgo_enfermedad', 'id')))
    if df.empty or len(df) < 50:
        raise ValueError("Dataset insuficiente para entrenar (mínimo 50 registros)")

    # Booleanos a int
    for col in ['fumador', 'consumo_alcohol', 'antecedentes_familiares']:
        df[col] = df[col].astype(int)

    # Normalizar/limpiar valores faltantes
    X = df[FEATURES].copy()
    X = X.apply(pd.to_numeric, errors='coerce')
    X = X.fillna(df[FEATURES].median(numeric_only=True))

    # Etiquetas como string consistente
    le = LabelEncoder()
    y_raw = df['riesgo_enfermedad'].astype(str).fillna('bajo')
    y = le.fit_transform(y_raw)
    return X, y, le, df['id'].tolist()


def entrenar_modelo(algoritmo: str = 'random_forest') -> ModeloML:
    """Entrena el modelo seleccionado y persiste métricas."""
    if algoritmo not in ALGORITMOS:
        raise ValueError(f"Algoritmo '{algoritmo}' no soportado")

    X, y, le, ids = _preparar_dataset()
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y)

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    clf = ALGORITMOS[algoritmo]

    # Nota: para RandomForest/DecisionTree el escalado no aporta y puede
    # empeorar en algunos escenarios. Usamos escalado solo para modelos
    # lineales.
    if algoritmo in ['logistic_regression']:
        X_train_use, X_test_use = X_train_s, X_test_s
    else:
        X_train_use, X_test_use = X_train, X_test

    clf.fit(X_train_use, y_train)
    y_pred = clf.predict(X_test_use)

    acc = round(float(accuracy_score(y_test, y_pred)), 4)
    prec = round(float(precision_score(y_test, y_pred, average='weighted', zero_division=0)), 4)
    rec = round(float(recall_score(y_test, y_pred, average='weighted', zero_division=0)), 4)
    f1 = round(float(f1_score(y_test, y_pred, average='weighted', zero_division=0)), 4)
    cm = confusion_matrix(y_test, y_pred).tolist()

    # Desactiva modelos anteriores del mismo tipo
    ModeloML.objects.filter(algoritmo=algoritmo).update(activo=False)

    modelo_obj = ModeloML.objects.create(
        nombre=f"{algoritmo.replace('_', ' ').title()} v{ModeloML.objects.count()+1}",
        algoritmo=algoritmo,
        accuracy=acc, precision=prec, recall=rec, f1_score=f1,
        matriz_confusion=cm,
        variables_predictoras=FEATURES,
        activo=True,
    )

    # Almacenar en disco usando pickle
    model_dir = os.path.join(settings.MEDIA_ROOT, 'models')
    os.makedirs(model_dir, exist_ok=True)

    clf_path = os.path.join(model_dir, f"modelo_{modelo_obj.id}_clf.pkl")
    scaler_path = os.path.join(model_dir, f"modelo_{modelo_obj.id}_scaler.pkl")
    le_path = os.path.join(model_dir, f"modelo_{modelo_obj.id}_le.pkl")

    with open(clf_path, 'wb') as f:
        pickle.dump(clf, f)
    with open(scaler_path, 'wb') as f:
        pickle.dump(scaler, f)
    with open(le_path, 'wb') as f:
        pickle.dump(le, f)

    # Almacena scaler y modelo en memoria por si acaso para la petición activa
    modelo_obj._clf = clf
    modelo_obj._scaler = scaler
    modelo_obj._le = le

    return modelo_obj, {'accuracy': acc, 'precision': prec, 'recall': rec,
                        'f1_score': f1, 'confusion_matrix': cm,
                        'clases': list(le.classes_)}


def _calcular_riesgo_clinico(paciente) -> dict:
    """
    Evalúa los indicadores clínicos del paciente y determina su nivel de riesgo
    mediante un sistema de puntuación clínica. Retorna el nivel, puntuación,
    factores alterados y una probabilidad estimada.
    """
    PUNTAJE_MEDIO = 1
    PUNTAJE_ALTO = 2
    PUNTAJE_CRITICO = 3
    PUNTAJE_LIFESTYLE = 1

    factores = []
    puntuacion = 0

    umbrales = [
        ('glucosa', 'Glucosa', 100, 126, 'mg/dL', True,
         'Nivel alto de glucosa en sangre. Riesgo de diabetes.'),
        ('imc', 'IMC', 25, 30, 'kg/m²', True,
         'El índice de masa corporal indica sobrepeso/obesidad.'),
        ('presion_sistolica', 'Presión Sistólica', 120, 140, 'mmHg', True,
         'Presión arterial sistólica elevada. Riesgo cardiovascular.'),
        ('presion_diastolica', 'Presión Diastólica', 80, 90, 'mmHg', True,
         'Presión arterial diastólica elevada.'),
        ('colesterol', 'Colesterol', 200, 240, 'mg/dL', True,
         'Nivel de colesterol elevado. Dislipidemia.'),
        ('saturacion_oxigeno', 'Saturación Oxígeno', 95, 90, '%', False,
         'Saturación de oxígeno baja. Posible insuficiencia respiratoria.'),
        ('temperatura', 'Temperatura', 37.5, 38.5, '°C', False,
         'Temperatura corporal elevada, posible proceso infeccioso.'),
        ('frecuencia_cardiaca', 'Frecuencia Cardíaca', 100, 120, 'lpm', False,
         'Frecuencia cardíaca elevada. Posible taquicardia.'),
    ]

    for campo, nombre, umbral_medio, umbral_alto, unidad, es_mayor_que, descripcion in umbrales:
        valor = getattr(paciente, campo, None)
        if valor is None or valor == 0:
            continue

        if es_mayor_que:
            if valor >= umbral_alto:
                impacto = 'alto'
                puntuacion += PUNTAJE_ALTO
            elif valor >= umbral_medio:
                impacto = 'medio'
                puntuacion += PUNTAJE_MEDIO
            else:
                continue
        else:
            if campo == 'saturacion_oxigeno':
                if valor < umbral_alto:
                    impacto = 'critico'
                    puntuacion += PUNTAJE_CRITICO
                elif valor < umbral_medio:
                    impacto = 'alto'
                    puntuacion += PUNTAJE_ALTO
                else:
                    continue
            else:
                if valor >= umbral_alto:
                    impacto = 'critico'
                    puntuacion += PUNTAJE_CRITICO
                elif valor >= umbral_medio:
                    impacto = 'alto'
                    puntuacion += PUNTAJE_ALTO
                else:
                    continue

        factores.append({
            'factor': nombre,
            'valor': valor,
            'unidad': unidad,
            'impacto': impacto,
            'descripcion': descripcion,
        })

    if getattr(paciente, 'fumador', False):
        puntuacion += PUNTAJE_LIFESTYLE
        factores.append({
            'factor': 'Tabaquismo',
            'valor': 'Sí', 'unidad': '', 'impacto': 'alto',
            'descripcion': 'El consumo de tabaco aumenta significativamente el riesgo cardiovascular y respiratorio.',
        })

    if getattr(paciente, 'consumo_alcohol', False):
        puntuacion += PUNTAJE_LIFESTYLE
        factores.append({
            'factor': 'Consumo de Alcohol',
            'valor': 'Sí', 'unidad': '', 'impacto': 'medio',
            'descripcion': 'El consumo de alcohol puede elevar la presión arterial, triglicéridos y afectar la función hepática.',
        })

    if getattr(paciente, 'antecedentes_familiares', False):
        puntuacion += PUNTAJE_LIFESTYLE
        factores.append({
            'factor': 'Antecedentes Familiares',
            'valor': 'Sí', 'unidad': '', 'impacto': 'medio',
            'descripcion': 'Existen antecedentes familiares de enfermedades cardiovasculares o metabólicas que aumentan el riesgo genético.',
        })

    # Mapear puntuación a nivel de riesgo
    max_posible = len(umbrales) * PUNTAJE_ALTO + 3 * PUNTAJE_LIFESTYLE
    if any(f['impacto'] == 'critico' for f in factores):
        nivel = 'critico'
        probabilidad = min(0.95, puntuacion / max_posible + 0.2)
    elif puntuacion >= 5:
        nivel = 'alto'
        probabilidad = min(0.85, puntuacion / max_posible + 0.1)
    elif puntuacion >= 2:
        nivel = 'medio'
        probabilidad = min(0.70, puntuacion / max_posible + 0.05)
    else:
        nivel = 'bajo'
        probabilidad = max(0.15, 1.0 - puntuacion / max_posible)

    probabilidad = round(probabilidad, 4)

    descripciones = {
        'bajo': 'Riesgo Bajo',
        'medio': 'Riesgo Moderado',
        'alto': 'Riesgo Alto',
        'critico': 'Riesgo Crítico',
    }
    detalles = {
        'bajo': 'El paciente presenta indicadores clínicos dentro de rangos normales. Se recomienda mantener hábitos saludables y chequeos de rutina.',
        'medio': 'El paciente presenta algunos indicadores clínicos ligeramente elevados. Se sugiere monitoreo periódico y ajustes en el estilo de vida.',
        'alto': 'Múltiples indicadores clínicos del paciente se encuentran elevados, lo que representa un riesgo alto para su salud. Se requiere intervención médica y cambios en el estilo de vida.',
        'critico': 'El paciente presenta valores clínicos críticos que requieren atención médica INMEDIATA. Algunos indicadores ponen en riesgo su vida.',
    }

    return {
        'nivel': nivel,
        'puntuacion': puntuacion,
        'probabilidad': probabilidad,
        'nivel_descripcion': descripciones[nivel],
        'nivel_detalle': detalles[nivel],
        'factores_clave': factores,
    }


def _generar_recomendaciones(paciente, factores_clave: list) -> list:
    """Genera recomendaciones basadas en los factores clínicos del paciente."""
    recs = []

    has_critico = any(f['impacto'] == 'critico' for f in factores_clave)
    has_alto = any(f['impacto'] == 'alto' for f in factores_clave)
    has_medio = any(f['impacto'] == 'medio' for f in factores_clave)

    if has_critico:
        recs.append('Se requiere atención médica URGENTE. Algunos indicadores presentan valores críticos.')
        recs.append('Realizar estudios complementarios de laboratorio y gabinete de forma inmediata.')
        recs.append('Monitoreo continuo de signos vitales. Considerar hospitalización si es necesario.')
    elif has_alto:
        recs.append('Se recomienda atención médica prioritaria en los próximos días.')
        recs.append('Realizar estudios de laboratorio (hemograma, perfil lipídico, glucosa en ayunas).')
        recs.append('Iniciar cambios en el estilo de vida: alimentación saludable y ejercicio moderado.')
    elif has_medio:
        recs.append('Programar control médico en el próximo mes para evaluar indicadores alterados.')
        recs.append('Adoptar hábitos de vida saludable: dieta balanceada baja en sodio y grasas.')
        recs.append('Monitorear niveles de glucosa y presión arterial mensualmente.')
    else:
        recs.append('Mantener los hábitos de vida saludable actuales.')
        recs.append('Realizar chequeos médicos preventivos anuales.')
        recs.append('Continuar con alimentación balanceada y actividad física regular.')

    for fc in factores_clave:
        nombre = fc['factor']
        imp = fc['impacto']
        if nombre == 'Glucosa' and imp in ('alto', 'critico'):
            recs.append('Reducir el consumo de azúcares refinados y carbohidratos simples. Consultar con endocrinología para manejo de glucemia.')
        elif nombre == 'IMC' and imp in ('alto', 'critico'):
            recs.append('Iniciar plan de pérdida de peso supervisado por nutricionista. Establecer meta de IMC menor a 25 kg/m².')
        elif nombre == 'Presión Sistólica' and imp in ('alto', 'critico'):
            recs.append('Controlar la presión arterial con medicación según indicación médica. Reducir consumo de sodio a menos de 2g/día.')
        elif nombre == 'Presión Diastólica' and imp in ('alto', 'critico'):
            recs.append('Monitorear presión diastólica. Evitar el consumo de alcohol y tabaco. Reducir el estrés.')
        elif nombre == 'Colesterol' and imp in ('alto', 'critico'):
            recs.append('Reducir consumo de grasas saturadas y trans. Incluir ácidos grasos omega-3 (pescado, nueces, linaza).')
        elif nombre == 'Saturación Oxígeno' and imp in ('alto', 'critico'):
            recs.append('Evaluación respiratoria urgente por neumología. Posible necesidad de oxigenoterapia complementaria.')
        elif nombre == 'Temperatura' and imp in ('alto', 'critico'):
            recs.append('Evaluar posible foco infeccioso. Realizar análisis de laboratorio (hemograma, PCR, procalcitonina).')
        elif nombre == 'Frecuencia Cardíaca' and imp in ('alto', 'critico'):
            recs.append('Evaluación cardiológica con electrocardiograma. Evitar estimulantes como cafeína, tabaco y bebidas energéticas.')
        elif nombre == 'Tabaquismo':
            recs.append('Suspender el consumo de tabaco de forma inmediata. Buscar apoyo en programas de cesación tabáquica.')
        elif nombre == 'Consumo de Alcohol':
            recs.append('Reducir o eliminar el consumo de alcohol. No se recomienda más de 1 copa al día.')
        elif nombre == 'Antecedentes Familiares':
            recs.append('Informar al médico sobre los antecedentes familiares. Evaluar necesidad de estudios genéticos o tamizaje temprano.')

    return recs[:7]


def predecir_paciente(paciente_id: int, modelo_id: int = None) -> dict:
    """
    Evalúa el riesgo de un paciente combinando:
    1. Evaluación clínica basada en sus indicadores (primaria)
    2. Predicción del modelo ML (referencia)
    """
    from apps.etl.models import Paciente as P
    paciente = P.objects.get(id_paciente=paciente_id)

    # 1. Evaluación clínica
    clinico = _calcular_riesgo_clinico(paciente)
    recomendaciones = _generar_recomendaciones(paciente, clinico['factores_clave'])

    # 2. Predicción del modelo ML (entrena uno por defecto si no existe)
    modelo_prediccion = None
    distribucion_clases = None
    if modelo_id:
        modelo_obj = ModeloML.objects.filter(id=modelo_id).first()
    else:
        modelo_obj = ModeloML.objects.filter(activo=True).first()
        if not modelo_obj:
            try:
                modelo_obj, _ = entrenar_modelo('random_forest')
            except Exception:
                modelo_obj = None

    if modelo_obj:
        try:
            datos = {f: getattr(paciente, f, 0) or 0 for f in FEATURES}
            for col in ['fumador', 'consumo_alcohol', 'antecedentes_familiares']:
                datos[col] = int(datos[col])
            X_input = pd.DataFrame([datos])[FEATURES]

            model_dir = os.path.join(settings.MEDIA_ROOT, 'models')
            clf_path = os.path.join(model_dir, f"modelo_{modelo_obj.id}_clf.pkl")
            scaler_path = os.path.join(model_dir, f"modelo_{modelo_obj.id}_scaler.pkl")
            le_path = os.path.join(model_dir, f"modelo_{modelo_obj.id}_le.pkl")

            if os.path.exists(clf_path):
                with open(clf_path, 'rb') as f:
                    clf = pickle.load(f)
                with open(scaler_path, 'rb') as f:
                    scaler = pickle.load(f)
                with open(le_path, 'rb') as f:
                    le = pickle.load(f)

                if modelo_obj.algoritmo in ['logistic_regression']:
                    X_use = scaler.transform(X_input)
                else:
                    X_use = X_input

                proba = clf.predict_proba(X_use)[0]
                clase_idx = int(np.argmax(proba))
                riesgo_ml = le.inverse_transform([clase_idx])[0]
                proba_ml = round(float(proba[clase_idx]), 4)

                modelo_prediccion = {
                    'riesgo_predicho': riesgo_ml,
                    'probabilidad': proba_ml,
                    'modelo_nombre': modelo_obj.nombre,
                    'modelo_algoritmo': modelo_obj.algoritmo,
                }
                distribucion_clases = dict(zip(le.classes_, proba.tolist()))

                # Guardar en BD
                PrediccionPaciente.objects.create(
                    paciente=paciente,
                    modelo=modelo_obj,
                    probabilidad_riesgo=proba_ml,
                    riesgo_predicho=riesgo_ml,
                )
        except Exception:
            modelo_prediccion = None

    return {
        'paciente_id': paciente_id,
        'paciente_nombre': f"{paciente.nombres} {paciente.apellidos}",
        'riesgo_predicho': clinico['nivel'],
        'probabilidad': clinico['probabilidad'],
        'puntuacion_clinica': clinico['puntuacion'],
        'nivel_descripcion': clinico['nivel_descripcion'],
        'nivel_detalle': clinico['nivel_detalle'],
        'factores_clave': clinico['factores_clave'],
        'recomendaciones': recomendaciones,
        'distribucion_clases': distribucion_clases,
        'prediccion_modelo': modelo_prediccion,
    }
