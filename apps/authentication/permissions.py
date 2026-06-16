from rest_framework.permissions import BasePermission


class EsAdministrador(BasePermission):
    def has_permission(self, request, view):
        return request.user.rol == 'administrador'


class EsMedico(BasePermission):
    def has_permission(self, request, view):
        return request.user.rol in ['administrador', 'medico']


class EsAnalista(BasePermission):
    def has_permission(self, request, view):
        return request.user.rol in ['administrador', 'analista']
