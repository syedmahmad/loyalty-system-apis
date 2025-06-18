import { Test, TestingModule } from '@nestjs/testing';
import { TiersController } from './tiers.controller';

describe('TiersController', () => {
  let controller: TiersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TiersController],
    }).compile();

    controller = module.get<TiersController>(TiersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
