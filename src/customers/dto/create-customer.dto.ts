export class CreateCustomerDto {
  tenant_id: number;
  name: string;
  phone: string;
  email?: string;
  external_id?: string;
}
