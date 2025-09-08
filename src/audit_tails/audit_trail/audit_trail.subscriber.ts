import {
  EventSubscriber,
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
  RemoveEvent,
} from 'typeorm';
import { AuditTrail } from '../entities/audit_trail';

@EventSubscriber()
export class GlobalAuditSubscriber implements EntitySubscriberInterface {
  listenTo() {
    return Object; // Listen to all entities
  }

  async afterInsert(event: InsertEvent<any>) {
    if (['Log', 'AuditTrail'].includes(event.metadata.name)) return;

    const repo = event.manager.getRepository(AuditTrail);
    await repo.save({
      table: event.metadata.name,
      rowId: event.entity.id,
      action: 'create',
      current_data: event.entity,
      previous_data: null,
      user: event.queryRunner.data?.user || null,
    });
  }

  async beforeUpdate(event: UpdateEvent<any>) {
    if (['Log', 'AuditTrail'].includes(event.metadata.name)) return;

    console.log('event.entity.id,', event.entity);

    const repo = event.manager.getRepository(AuditTrail);
    await repo.save({
      table: event.metadata.name,
      rowId: event.entity?.id,
      action: 'update',
      current_data: event.entity,
      previous_data: event.databaseEntity,
      user: event.queryRunner.data?.user || null,
    });
  }

  async beforeRemove(event: RemoveEvent<any>) {
    if (['Log', 'AuditTrail'].includes(event.metadata.name)) return;

    const repo = event.manager.getRepository(AuditTrail);
    await repo.save({
      table: event.metadata.name,
      rowId: event.entityId as number,
      action: 'delete',
      current_data: null,
      previous_data: event.databaseEntity,
      user: event.queryRunner.data?.user || null,
    });
  }
}
