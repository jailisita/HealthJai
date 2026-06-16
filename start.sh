#!/bin/bash

echo "→ Running migrations..."
python manage.py migrate --noinput || echo "⚠️  Migration failed"

echo "→ Creating superuser if not exists..."
python manage.py shell -c "
from apps.authentication.models import Usuario
if not Usuario.objects.filter(username='admin').exists():
    Usuario.objects.create_superuser('admin', 'admin@sadaips.co', 'admin123', rol='administrador')
    print('  Superusuario creado: admin / admin123')
" || echo "⚠️  Superuser creation skipped"

if [ "$DISABLE_COLLECTSTATIC" != "1" ]; then
    echo "→ Collecting static files..."
    python manage.py collectstatic --noinput --clear || echo "⚠️  Collectstatic failed"
fi

echo "→ Starting gunicorn..."
exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 3 --timeout 120
