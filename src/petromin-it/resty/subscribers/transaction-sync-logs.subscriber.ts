import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from 'typeorm';
import { TransactionSyncLog } from '../entities/transaction-sync-logs.entity';
import { RestyInvoicesInfo } from 'src/petromin-it/resty/entities/resty_invoices_info.entity';
import { VehiclesService } from 'src/vehicles/vehicles/vehicles.service';
import { WalletService } from 'src/wallet/wallet/wallet.service';
// import {
// WalletTransactionStatus,
// WalletTransactionType,
// } from 'src/wallet/entities/wallet-transaction.entity';
// import { encrypt } from 'src/helpers/encryption';
// import { BadRequestException } from '@nestjs/common';

// Remove @EventSubscriber() decorator and register manually
@EventSubscriber()
export class TransactionSyncLogsSubscriber
  implements EntitySubscriberInterface<TransactionSyncLog>
{
  constructor(
    private readonly vehicleService: VehiclesService,
    private readonly walletService: WalletService,
  ) {}
  listenTo() {
    return TransactionSyncLog;
  }

  async afterInsert(event: InsertEvent<TransactionSyncLog>): Promise<void> {
    const entity = event.entity as TransactionSyncLog | undefined;
    try {
      if (!entity) return;
      // Only process rows that have a request body and are newly inserted (implicitly pending by our controller)
      if (
        !entity.request_body ||
        (Array.isArray(entity.request_body) && entity.request_body.length === 0)
      ) {
        return;
      }

      const payload = entity.request_body as any;

      const customers = Array.isArray(payload?.customers)
        ? payload.customers
        : [];
      if (customers.length === 0) {
        return;
      }

      const invoicesRepo = event.manager.getRepository(RestyInvoicesInfo);

      for (const cust of customers) {
        // map customer fields (example uses "id(CustomerID)" etc)
        const customerId: string | null = cust?.['id(CustomerID)'] ?? null;
        const phone: string | null = cust?.['phone_number(Mobile)'] ?? null;

        const vehicles = Array.isArray(cust?.['vehicles(Vehicle)'])
          ? cust['vehicles(Vehicle)']
          : [];

        for (const veh of vehicles) {
          const plate: string | null =
            veh?.['vehicle_number(PlateNumber)'] ?? null;
          const vin: string | null = veh?.['vin_number(VIN)'] ?? null;

          const brandName: string | null =
            veh?.['vehicle_brand_id(VehicleMake)']?.['name(MakeName)'] ?? null;
          const variantName: string | null =
            veh?.['vehicle_variant_id(VehicleModel)']?.['name(ModelName)'] ??
            null;
          const vehicleInfo: string | null =
            [brandName, variantName].filter(Boolean).join(' ') || null;

          const jobcards = Array.isArray(veh?.['jobcards(WorkOrder)'])
            ? veh['jobcards(WorkOrder)']
            : [];

          for (const jc of jobcards) {
            const inv = jc?.['jobcard_invoices(Invoice)'];
            if (!inv) continue;

            // invoice-level fields (example keys with parentheses)
            const invoiceId: string | null = inv?.['id(InvoiceID)'] ?? null;
            const invoiceNo: string | null =
              inv?.['invoice_no(InvoiceNumber)'] ?? null;
            const invoiceAmount: number | null =
              inv?.['total_amount(InvoiceTotalAmount)'] != null
                ? Number(inv['total_amount(InvoiceTotalAmount)'])
                : null;
            const invoiceDate: string | null =
              inv?.['created_at(InvoiceDate)'] ?? null;

            // collect free items nested under services
            const svcArray = Array.isArray(
              inv?.['jobcard_invoice_items(InvoiceService)'],
            )
              ? inv['jobcard_invoice_items(InvoiceService)']
              : [];

            const freeItems: any[] = [];

            for (const svc of svcArray) {
              // each service may contain FreeItems(InvoiceServiceItemFree)
              const freeArray = Array.isArray(
                svc?.['FreeItems(InvoiceServiceItemFree)'],
              )
                ? svc['FreeItems(InvoiceServiceItemFree)']
                : // fallback: some payloads may use 'FreeItems' plain
                  Array.isArray(svc?.FreeItems)
                  ? svc.FreeItems
                  : [];

              for (const free of freeArray) {
                // normalize free item structure (names are exactly from example PDF)
                const freeId =
                  free?.['id(InvoiceServiceItemFreeID)'] ??
                  free?.id ??
                  null; /* id may appear in different variants */
                const invoiceServiceId =
                  free?.InvoiceServiceID ?? free?.['InvoiceServiceID'] ?? null;

                // item object is nested under "Item(ItemID)"
                const itemObj = free?.['Item(ItemID)'] ?? free?.Item ?? null;

                const itemId = itemObj?.['id(ItemID)'] ?? itemObj?.id ?? null;
                const itemCode =
                  itemObj?.ItemCode ?? itemObj?.['ItemCode'] ?? null;

                const itemName =
                  itemObj?.['ItemName(ItemID.ItemName)'] ??
                  itemObj?.ItemName ??
                  null;

                const quantity = free?.ItemQuantity
                  ? Number(free.ItemQuantity)
                  : free?.['ItemQuantity']
                    ? Number(free['ItemQuantity'])
                    : null;

                const itemCost =
                  free?.ItemCost != null
                    ? Number(free.ItemCost)
                    : free?.['ItemCost'] != null
                      ? Number(free['ItemCost'])
                      : itemObj?.ItemCost != null
                        ? Number(itemObj.ItemCost)
                        : null;

                freeItems.push({
                  id: freeId,
                  invoice_service_id: invoiceServiceId,
                  item_id: itemId,
                  item_code: itemCode,
                  item_name: itemName,
                  quantity,
                  item_cost: itemCost,
                });
              }
            }

            // create invoice row (keep your existing fields)
            const row = invoicesRepo.create({
              customer_id: customerId,
              phone: phone,
              invoice_no: invoiceNo,
              invoice_id: invoiceId,
              invoice_amount: invoiceAmount,
              invoice_date: invoiceDate,
              vehicle_plate_number: plate,
              vehicle_vin: vin,
              vehicle_info: vehicleInfo,
              // Ensure claim-related fields remain null/empty
              is_claimed: null,
              clamined_points: null,
              claim_id: null,
              claim_date: null,
              free_items: freeItems.length ? freeItems : null,
              sync_log_id: entity.id,
            });

            await invoicesRepo.save(row);
          } // end jobcards loop
        } // end vehicles loop
      } // end customers loop

      console.log('entity!.id', entity!.id);

      entity.status = 'completed';
      await event.manager.getRepository(TransactionSyncLog).save(entity);
    } catch (err) {
      // Silently ignore to avoid breaking insert flow; do not process this record further
      // Optionally, could mark status to failed if needed:
      try {
        entity.status = 'failed';
        await event.manager.getRepository(TransactionSyncLog).save(entity);
      } catch (_) {
        // ignore
      }
    }
  }
}
