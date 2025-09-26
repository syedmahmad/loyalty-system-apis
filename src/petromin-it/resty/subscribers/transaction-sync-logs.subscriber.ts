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
        const customerId: string | null = cust?.id ?? null;
        const phone: string | null = cust?.phone_number ?? null;
        const vehicles = Array.isArray(cust?.vehicles) ? cust.vehicles : [];
        for (const veh of vehicles) {
          const plate: string | null = veh?.vehicle_number ?? null;
          const vin: string | null = veh?.vin_number ?? null;
          const brandName: string | null = veh?.vehicle_brand_id?.name ?? null;
          const variantName: string | null =
            veh?.vehicle_variant_id?.name ?? null;
          const vehicleInfo: string | null =
            [brandName, variantName].filter(Boolean).join(' ') || null;

          const jobcards = Array.isArray(veh?.jobcards) ? veh.jobcards : [];
          for (const jc of jobcards) {
            const inv = jc?.jobcard_invoices;
            if (!inv) continue;

            const invoiceId: string | null = inv?.id ?? null;
            const invoiceNo: string | null = inv?.invoice_no ?? null;
            const invoiceAmount: number | null =
              inv?.total_amount != null ? Number(inv.total_amount) : null;
            const invoiceDate: string | null = inv?.created_at ?? null;

            // Aggregate free items across invoice items
            const items = Array.isArray(inv?.jobcard_invoice_items)
              ? inv.jobcard_invoice_items
              : [];
            const freeItems: any[] = [];
            for (const it of items) {
              const fi = Array.isArray(it?.FreeItems) ? it.FreeItems : [];
              for (const f of fi) freeItems.push(f);
            }

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

            // // 1. Check if customer exists with the given phone number
            // const customerRepo = event.manager.getRepository('Customer');
            // const customer = await customerRepo.findOne({
            //   where: { hashed_number: encrypt(phone) },
            // });

            // const points = null;
            // if (customer) {
            //   // 2. Get all vehicles from resty api using getCustomerVehicle
            //   // Assume vehicleService is available in this context
            //   const customerVehicles =
            //     await this.vehicleService.getCustomerVehicle(customer.uuid);
            //   // 3. Check if vehicle with same id exists in returned data
            //   // We assume 'vin' is the unique identifier for vehicle
            //   const matchedVehicle = Array.isArray(customerVehicles)
            //     ? customerVehicles.find((v) => v.registration_number === plate)
            //     : null;

            //   if (matchedVehicle) {
            //     // 4. Get customer wallet
            //     const walletRepo = event.manager.getRepository('Wallet');
            //     const wallet = await walletRepo.findOne({
            //       where: { customer_id: customer.id },
            //     });

            //     // 5. Get business_unit_id from customer
            //     const businessUnitId = customer.business_unit_id;

            //     // 6. Get earning rule from rules table
            //     const rulesRepo = event.manager.getRepository('Rule');
            //     const earningRule = await rulesRepo.findOne({
            //       where: {
            //         business_unit_id: businessUnitId,
            //         rule_type: 'spend and earn',
            //         rewards_condition: 'perAmount',
            //       },
            //     });

            //     let rewardPoints = 0;
            //     // 7. Calculate points accordingly
            //     if (earningRule) {
            //       if (invoiceAmount < earningRule.min_amount_spent) {
            //         throw new BadRequestException(
            //           `Minimum amount to earn points is ${earningRule.min_amount_spent}`,
            //         );
            //       }
            //       // Points per amount spent
            //       const multiplier = Math.floor(
            //         invoiceAmount / earningRule.min_amount_spent === 0
            //           ? 1
            //           : earningRule.min_amount_spent,
            //       );
            //       rewardPoints = multiplier * rewardPoints;
            //     }

            //     // 8. Create transaction in walletTransaction using addTransaction method
            //     // Assume walletTransactionService is available in this context
            //     await this.walletService.addTransaction(
            //       {
            //         wallet_id: wallet.id,
            //         business_unit_id: customer.business_unit_id,
            //         type: WalletTransactionType.EARN,
            //         status: WalletTransactionStatus.ACTIVE,
            //         amount: rewardPoints,
            //         source_type: 'invoice',
            //         description: `Points earned for invoice ${invoiceNo}`,
            //         created_by: 0,
            //       },
            //       0,
            //     );

            //     // 9. Update the invoice row to assign is_claimed to 1 and claimed_points to points
            //     row.is_claimed = true;
            //     row.clamined_points = points;
            //   }
            // }
            await invoicesRepo.save(row);
          }
        }
      }

      await event.manager
        .getRepository(TransactionSyncLog)
        .update({ id: entity!.id }, { status: 'completed' });
    } catch (err) {
      // Silently ignore to avoid breaking insert flow; do not process this record further
      // Optionally, could mark status to failed if needed:
      try {
        await event.manager
          .getRepository(TransactionSyncLog)
          .update({ id: entity!.id }, { status: 'failed' });
      } catch (_) {
        // ignore
      }
    }
  }
}
