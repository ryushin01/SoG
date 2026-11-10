import { inject, Pipe, type PipeTransform } from '@angular/core';
import { Session } from '../model/session';

/** 사용자 ID를 이름으로 바꿉니다. 사용자 목록이 늦게 와도 다시 그리도록 순수하지 않은 파이프로 둡니다. */
@Pipe({ name: 'userName', pure: false })
export class UserNamePipe implements PipeTransform {
  private readonly session = inject(Session);
  transform(id: string | null | undefined): string {
    return this.session.nameOf(id);
  }
}
