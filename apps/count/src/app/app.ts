import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppFrame } from '@/widgets/app-frame';

@Component({
  selector: 'cnt-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, AppFrame],
  template: `<cnt-app-frame><router-outlet /></cnt-app-frame>`,
})
export class App {}
