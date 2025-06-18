import { Test, TestingModule } from '@nestjs/testing';
import { TiersService } from './tiers.service';

describe('TiersService', () => {
  let service: TiersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TiersService],
    }).compile();

    service = module.get<TiersService>(TiersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
