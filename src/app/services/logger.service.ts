import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class LoggerService {
  private readonly api = inject(ApiService);

  async log(user: string, type: string, description: string): Promise<void> {
    const id = Date.now().toString();
    await this.api.creer('logs', { user, type, description }, id);
  }
}
