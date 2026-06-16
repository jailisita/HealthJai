from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import LoginView, registro, perfil, usuarios, usuario_detalle

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('registro/', registro, name='registro'),
    path('perfil/', perfil, name='perfil'),
    path('usuarios/', usuarios, name='usuarios_api'),
    path('usuarios/<int:pk>/', usuario_detalle, name='usuario_detalle'),
]
