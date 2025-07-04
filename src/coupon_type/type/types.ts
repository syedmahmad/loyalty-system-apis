export const ActiveStatus = {
  INACTIVE: 0,
  ACTIVE: 1,
  PENDING: 2,
  SUSPENDED: 3,
  DELETED: 4,
} as const;

export type ActiveStatusType = (typeof ActiveStatus)[keyof typeof ActiveStatus];
