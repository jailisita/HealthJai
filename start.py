import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def run(*args):
    from django.core.management import call_command
    call_command(*args)

def main():
    port = os.environ.get('PORT', '8000')

    print("→ Running migrations...")
    try:
        run('migrate', '--noinput')
    except Exception as e:
        print(f"⚠️  Migration failed: {e}")

    print("→ Creating superuser if not exists...")
    django.setup()
    from apps.authentication.models import Usuario
    if not Usuario.objects.filter(username='admin').exists():
        Usuario.objects.create_superuser('admin', 'admin@sadaips.co', 'admin123', rol='administrador')
        print('  ✓ Superusuario creado: admin / admin123')
    else:
        print('  → Superusuario ya existe')

    if os.environ.get('DISABLE_COLLECTSTATIC') != '1':
        print("→ Collecting static files...")
        try:
            run('collectstatic', '--noinput', '--clear')
        except Exception as e:
            print(f"⚠️  Collectstatic failed: {e}")

    print(f"→ Starting gunicorn on 0.0.0.0:{port}...")
    from gunicorn.app.wsgiapp import run as gunicorn_run
    sys.argv = ['gunicorn', 'config.wsgi:application',
                '--bind', f'0.0.0.0:{port}',
                '--workers', '3',
                '--timeout', '120']
    gunicorn_run()

if __name__ == '__main__':
    main()
