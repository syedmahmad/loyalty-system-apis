export class CreateBusinessUnitDto {
  tenant_id: number;
  name: string;
  description?: string;
  location?: string;
  type?: string; // 'points' | 'otp'
  icon?: string | null;
  redemption_enabled?: number; // 1 = yes, 0 = no
}
