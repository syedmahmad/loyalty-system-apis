import { Controller, Get, Query } from '@nestjs/common';

import { LanguageListDto } from './dto/language.dto';
import { LanguageService } from './language.service';

@Controller('master/language')
export class LanguageController {
  constructor(private readonly languageService: LanguageService) {}

  @Get()
  getLanguages(@Query() query: LanguageListDto) {
    return this.languageService.getLanguages(query);
  }

  @Get('sync')
  sync() {
    return this.languageService.sync();
  }
}
