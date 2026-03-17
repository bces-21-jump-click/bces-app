import { inject } from '@angular/core';
import { Router, type ActivatedRouteSnapshot, type CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.estConnecte()) {
    return router.createUrlTree(['/connexion']);
  }

  const requiredPermissions = (route.data?.['permissions'] as string[]) ?? [];
  if (requiredPermissions.length === 0) {
    return true;
  }

  const userPerms = auth.profile()?.permissions ?? [];
  if (userPerms.includes('dev') || userPerms.includes('admin')) {
    return true;
  }

  const hasPermission = requiredPermissions.some((p) => userPerms.includes(p));
  if (hasPermission) {
    return true;
  }

  return router.createUrlTree(['/']);
};
