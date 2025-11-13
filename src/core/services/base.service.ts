import { HttpException, HttpStatus } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';

export abstract class BaseService {
  protected handleError(error: any): never {
    throw new HttpException(
      {
        status: error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        error: error?.response?.error,
        message: error.message,
      },
      error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  protected includeCreatorUpdater<T>(
    queryBuilder: SelectQueryBuilder<T>,
  ): SelectQueryBuilder<T> {
    const alias = queryBuilder.alias;
    return queryBuilder
      .leftJoin(`${alias}.createdByUser`, 'createdByUser')
      .leftJoin(`${alias}.updatedByUser`, 'updatedByUser')
      .addSelect([
        'createdByUser.id',
        'createdByUser.firstName',
        'createdByUser.lastName',
      ])
      .addSelect([
        'updatedByUser.id',
        'updatedByUser.firstName',
        'updatedByUser.lastName',
      ]);
  }
}
