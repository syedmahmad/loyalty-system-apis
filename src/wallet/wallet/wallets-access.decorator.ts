import { SetMetadata } from '@nestjs/common';

export const WALLETS_ACCESS_KEY = 'WALLETS_access';
export const WALLETSAccess = () => SetMetadata(WALLETS_ACCESS_KEY, true);
