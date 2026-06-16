import os
import sys
import time
import django
from django.db import connections
from django.db.utils import OperationalError

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def run(*args):
    from django.core.management import call_command
    call_command(*args)

def wait_for_db(max_retries=30, interval=2):
    django.setup()
    db_conn = connections['default']
    for i in range(max_retries):
        try:
            db_conn.ensure_connection()
            print("→ Base de datos conectada")
            return
        except OperationalError as e:
            if i < max_retries - 1:
                print(f"  Esperando base de datos ({i+1}/{max_retries})...")
                time.sleep(interval)
            else:
                print(f"✗ No se pudo conectar a la base de datos: {e}")
                sys.exit(1)

def main():
    port = os.environ.get('PORT', '8000')

    wait_for_db()

    print("→ Running migrations...")
    run('migrate', '--noinput')

    print("→ Creating users if not exists...")
    from apps.authentication.models import Usuario

    usuarios = [
        ('admin',     'admin@sadaips.co',    'admin123',    'administrador'),
        ('medico',    'medico@sadaips.co',   'medico123',   'medico'),
        ('analista',  'analista@sadaips.co', 'analista123', 'analista'),
    ]
    for username, email, password, rol in usuarios:
        if not Usuario.objects.filter(username=username).exists():
            Usuario.objects.create_superuser(username, email, password, rol=rol)
            print(f'  ✓ {username} creado ({rol})')
        else:
            print(f'  → {username} ya existe')

    if os.environ.get('DISABLE_COLLECTSTATIC') != '1':
        print("→ Collecting static files...")
        run('collectstatic', '--noinput', '--clear')

    print(f"→ Starting gunicorn on 0.0.0.0:{port}...")
    from gunicorn.app.wsgiapp import run as gunicorn_run
    sys.argv = ['gunicorn', 'config.wsgi:application',
                '--bind', f'0.0.0.0:{port}',
                '--workers', '3',
                '--timeout', '120']
    gunicorn_run()

if __name__ == '__main__':
    main()
