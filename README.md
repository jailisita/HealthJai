
# HealthAnalytics IPS — Plataforma Inteligente de Analítica Clínica

[![Django](https://img.shields.io/badge/Django-4.2-092E20?logo=django)](https://www.djangoproject.com/)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python)](https://python.org/)
[![Bootstrap](https://img.shields.io/badge/Bootstrap-5-7952B3?logo=bootstrap)](https://getbootstrap.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Plataforma FullStack para instituciones de salud que integra procesos **ETL**, **analítica de datos**, **Machine Learning** y **reportes automatizados** para la detección temprana de riesgo clínico.

---

## ✨ Funcionalidades

| Módulo | Descripción |
|--------|-------------|
| **🔐 Autenticación** | Login JWT con roles: Administrador, Médico, Analista |
| **⚙️ ETL** | Carga, limpieza y transformación de datasets clínicos (Excel/CSV) con historial detallado |
| **📊 Analítica** | KPIs, estadísticas descriptivas, segmentación de pacientes, tendencias mensuales |
| **🤖 Machine Learning** | Entrenamiento y predicción con Random Forest, Regresión Logística y Árbol de Decisión |
| **📈 Dashboard** | Visualización interactiva con Chart.js y métricas agregadas en tiempo real |
| **📄 Reportes** | Exportación a CSV, Excel y PDF |

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
|------|-------------|
| **Backend** | Python 3.12, Django 4.2, Django REST Framework 3.15 |
| **Auth** | JWT (djangorestframework-simplejwt 5.3) |
| **Ciencia de Datos** | Pandas 2.2, NumPy 1.26, Scikit-Learn 1.5 |
| **Base de Datos** | SQLite (desarrollo) / PostgreSQL 16 (producción) |
| **Frontend** | HTML5, Bootstrap 5, Chart.js, JavaScript vanilla |
| **Exportación** | openpyxl, csv, reportlab (PDF) |
| **Documentación API** | drf-spectacular (Swagger/OpenAPI) |
| **Infraestructura** | Docker, Docker Compose, Nginx, Gunicorn |

---

## 📁 Estructura del Proyecto

```
healthcare-etl-platform/
├── apps/
│   ├── authentication/        # Usuarios, roles, JWT
│   ├── etl/                   # Motor ETL + modelos Paciente / HistorialETL
│   ├── analytics/             # KPIs, estadísticas, segmentación
│   ├── ml/                    # Entrenamiento y predicción ML
│   ├── dashboard/             # API agregada para dashboard
│   └── reports/               # Exportación CSV / Excel / PDF
├── frontend/
│   ├── templates/             # Plantillas Django (auth/, base/, dashboard/, etl/, ml/)
│   │   └── base/
│   │       └── base.html      # Plantilla base con Bootstrap 5
│   └── static/
│       ├── css/main.css
│       └── js/                # auth.js · dashboard.js · etl.js · ml.js · pacientes.js
├── config/                    # settings.py · urls.py · wsgi.py
├── datasets/                  # Dataset clínico (dataset_clinico.xlsx)
├── docs/                      # Documentación técnica y manual de usuario
├── docker/                    # nginx.conf · entrypoint.sh
├── .env.example
├── docker-compose.yml         # PostgreSQL + Django + Nginx
├── Dockerfile
├── manage.py
├── requirements.txt
├── setup.sh                   # Setup para Linux/macOS
└── setup.ps1                  # Setup para Windows
```

---

## 🚀 Instalación y Ejecución

### 📋 Requisitos

- Python 3.12+
- Node.js (opcional, solo para assets)
- Docker y Docker Compose (opcional, para despliegue)

### 🪟 Windows (PowerShell)

```powershell
.\setup.ps1
.\venv\Scripts\activate
python manage.py runserver
```

### 🐧 Linux / macOS

```bash
chmod +x setup.sh && ./setup.sh
source venv/bin/activate
python manage.py runserver
```

### 🐳 Docker

```bash
docker-compose up --build
```

### 🔑 Acceso

| Recurso | URL | Credenciales |
|---------|-----|--------------|
| **Plataforma** | http://localhost:8000 | `admin` / `admin123` |
| **Admin Django** | http://localhost:8000/admin | `admin` / `admin123` |
| **Swagger API** | http://localhost:8000/api/docs/ | — |

---

## 📡 APIs REST

### 🔐 Autenticación

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/auth/login/` | POST | Obtener tokens JWT (access + refresh) |
| `/api/auth/refresh/` | POST | Refrescar access token |
| `/api/auth/register/` | POST | Registrar nuevo usuario |
| `/api/auth/me/` | GET | Perfil del usuario autenticado |

### 🩺 Pacientes

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/pacientes/` | GET | Listar pacientes (filtros: `?riesgo=alto&sexo=M&critico=true`) |
| `/api/pacientes/<id>/` | GET | Detalle de un paciente |

### ⚙️ ETL

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/etl/run/` | POST | Ejecutar ETL con el dataset cargado |
| `/api/etl/upload/` | POST | Subir archivo Excel/CSV y ejecutar ETL |
| `/api/etl/historial/` | GET | Historial de ejecuciones ETL |

### 📊 Analítica

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/analytics/kpis/` | GET | KPIs médicos principales |
| `/api/analytics/estadisticas/` | GET | Estadística descriptiva |
| `/api/analytics/segmentacion/` | GET | Segmentación por edad, IMC, diagnóstico |
| `/api/analytics/tendencias/` | GET | Tendencias de consultas mensuales |

### 🤖 Machine Learning

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/ml/entrenar/` | POST | Entrenar modelo ML |
| `/api/ml/predecir/` | POST | Predecir riesgo de un paciente |
| `/api/ml/modelos/` | GET | Listar modelos entrenados |

### 📥 Reportes

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/reportes/csv/` | GET | Exportar pacientes en CSV |
| `/api/reportes/excel/` | GET | Exportar pacientes en Excel |
| `/api/reportes/pdf/` | GET | Exportar reporte en PDF |

### 📈 Dashboard

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/dashboard/kpis/` | GET | Datos agregados para dashboard |

---

## 🔄 Proceso ETL

```
┌─────────┐     ┌──────────────┐     ┌─────────┐     ┌──────────────────┐
│ EXTRACT │ ──→ │  TRANSFORM   │ ──→ │  LOAD   │ ──→ │    HISTORIAL     │
└─────────┘     └──────────────┘     └─────────┘     └──────────────────┘
   Excel/CSV     • Elimina duplicados     BD SQLite/     Registro con
   1800 reg.     • Trata valores nulos     PostgreSQL    logs, métricas
   (con errores  • Corrige tipos                        y tiempo de
    simulados)   • Valida rangos                          ejecución
                 clínicos
                 • Normaliza
                 categorías
                 • Recalcula IMC
                 • Detecta críticos
```

### Criterios de Paciente Crítico

| Parámetro | Umbral |
|-----------|--------|
| Presión sistólica | > 180 mmHg |
| Glucosa | > 300 mg/dL |
| Saturación de oxígeno | < 85% |

---

## 🤖 Machine Learning

### Algoritmos Soportados

| Algoritmo | Tipo | Uso |
|-----------|------|-----|
| **Random Forest** | Ensemble | Predicción general (mejor precisión) |
| **Regresión Logística** | Lineal | Predicción probabilística |
| **Árbol de Decisión** | Clasificación | Interpretabilidad y reglas |

### Variables Predictoras

`IMC` · `Edad` · `Glucosa` · `Colesterol` · `Presión sistólica` · `Presión diastólica` · `Frecuencia cardíaca` · `Saturación O₂` · `Temperatura` · `Fumador` · `Consumo alcohol` · `Antecedentes familiares`

### Métricas

`Accuracy` · `Precision` · `Recall` · `F1-Score` · `Matriz de Confusión`

---

## 👥 Roles del Sistema

| Rol | Permisos |
|-----|----------|
| **Administrador** | Gestión completa: usuarios, ETL, ML, reportes, dashboard |
| **Médico** | Visualización clínica, consulta de pacientes y predicciones |
| **Analista** | Ejecución ETL, analítica, exportación de reportes |

---

## 🧪 Dataset

El proyecto incluye un dataset clínico simulado (`datasets/dataset_clinico.xlsx`) con **~1800 registros** que contiene errores intencionales (duplicados, valores nulos, rangos inválidos) para validar el proceso ETL.

### Variables del Dataset

| Variable | Tipo | Descripción |
|----------|------|-------------|
| Edad | Numérica | 18–100 años |
| Sexo | Categórica | M / F |
| Peso, Altura | Numérica | kg, m |
| IMC | Derivada | kg/m² (bajo_peso, normal, sobrepeso, obesidad) |
| Presión arterial | Numérica | Sistólica / Diastólica (mmHg) |
| Glucosa | Numérica | mg/dL |
| Colesterol | Numérica | mg/dL |
| Frecuencia cardíaca | Numérica | lpm |
| Saturación O₂ | Numérica | % |
| Temperatura | Numérica | °C |
| Fumador | Booleana | Sí / No |
| Consumo alcohol | Booleana | Sí / No |
| Actividad física | Categórica | Sedentario / Baja / Media / Alta |
| Antecedentes familiares | Booleana | Sí / No |

---

## 🌐 Despliegue con Docker

```bash
# Construir e iniciar servicios
docker-compose up --build -d

# Servicios:
#   • PostgreSQL 16   → puerto 5432
#   • Django/Gunicorn → puerto 8000
#   • Nginx           → puerto 80

# Logs
docker-compose logs -f

# Detener
docker-compose down
```

### Variables de Entorno (.env)

| Variable | Descripción | Default |
|----------|-------------|---------|
| `SECRET_KEY` | Clave secreta Django | — |
| `DEBUG` | Modo depuración | `True` |
| `ALLOWED_HOSTS` | Hosts permitidos | `localhost,127.0.0.1` |
| `DB_ENGINE` | Motor de base de datos | `django.db.backends.sqlite3` |
| `DB_NAME` | Nombre BD | `db.sqlite3` |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | Vida útil token access | `60` |
| `JWT_REFRESH_TOKEN_LIFETIME_DAYS` | Vida útil token refresh | `7` |

---

## 📖 Documentación Adicional

| Recurso | Descripción |
|---------|-------------|
| [`docs/manual_usuario.md`](docs/manual_usuario.md) | Manual de usuario con capturas |
| [`docs/technical_docs.md`](docs/technical_docs.md) | Documentación técnica detallada |
| [`docs/schema.sql`](docs/schema.sql) | Esquema de base de datos |
| `/api/docs/` | Documentación interactiva Swagger/OpenAPI |

---

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Consulta el archivo `LICENSE` para más detalles.

---

<p align="center">Hecho con ❤️ para la transformación digital de la salud</p>
