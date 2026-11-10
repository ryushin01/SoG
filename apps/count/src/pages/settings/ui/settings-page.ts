import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NetworkState } from '@/shared/api';
import { AgoPipe } from '@/shared/lib';
import { OperatorSession } from '@/entities/operator';
import { Outbox } from '@/entities/outbox';

@Component({
  selector: 'cnt-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AgoPipe],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.css',
})
export class SettingsPage {
  protected readonly outbox = inject(Outbox);
  protected readonly network = inject(NetworkState);
  protected readonly session = inject(OperatorSession);
  private readonly router = inject(Router);

  protected toggleOffline(event: Event): void {
    this.network.simulatedOffline.set((event.target as HTMLInputElement).checked);
  }

  protected switchOperator(): void {
    this.session.signOut();
    void this.router.navigateByUrl('/start');
  }
}
