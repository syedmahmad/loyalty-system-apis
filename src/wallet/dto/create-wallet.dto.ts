export class CreateWalletDto {
  customer_id: number;
  business_unit_id: number;
  tenant_id: number;
  allow_negative?: boolean;
}
