import { httpResource } from '@angular/common/http';
import { computed, Injectable } from '@angular/core';
import type { Location, Reference, Zone, ZoneCode } from '@sog/domain';

/** 구역과 로케이션 목록. 거의 바뀌지 않으므로 앱 전체에서 한 번만 불러옵니다. */
@Injectable({ providedIn: 'root' })
export class LocationDirectory {
  private readonly reference = httpResource<Reference>(() => '/api/reference');
  readonly zones = computed<Zone[]>(
    () => (this.reference.hasValue() ? this.reference.value() : undefined)?.zones ?? [],
  );
  readonly locations = computed<Location[]>(
    () => (this.reference.hasValue() ? this.reference.value() : undefined)?.locations ?? [],
  );

  inZone(zone: ZoneCode): Location[] {
    return this.locations().filter((location) => location.zone === zone);
  }

  codeOf(id: string | null | undefined): string {
    if (!id) return '—';
    return this.locations().find((location) => location.id === id)?.code ?? id;
  }
}
