import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const STAR = 'M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z';

/** Bis zu drei Sterne; gefüllt = erreicht. */
@Component({
  selector: 'app-stars',
  template: `
    <svg viewBox="0 0 72 24" role="img" [attr.aria-label]="label()">
      @for (i of slots; track i) {
        <path [attr.d]="star" [attr.transform]="'translate(' + i * 24 + ' 0)'" [class.on]="i < value()" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-block;
      line-height: 0;
    }
    svg {
      width: var(--stars-width, 66px);
      height: auto;
    }
    path {
      fill: none;
      stroke: var(--muted);
      stroke-width: 1.6;
      stroke-linejoin: round;
      opacity: 0.7;
    }
    path.on {
      fill: var(--hand-right);
      stroke: var(--hand-right-dark);
      opacity: 1;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StarsComponent {
  readonly value = input(0);
  protected readonly slots = [0, 1, 2];
  protected readonly star = STAR;
  protected readonly label = computed(() => `${this.value()} von 3 Sternen`);
}
