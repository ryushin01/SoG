import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Shell } from '@/widgets/shell';

@Component({
  selector: 'sog-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Shell],
  template: `<sog-shell><router-outlet /></sog-shell>`,
})
export class App {}
