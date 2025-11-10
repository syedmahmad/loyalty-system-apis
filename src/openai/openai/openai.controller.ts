import { Body, Controller, Post } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import { TranslationDto } from '../dto/translation.dto';

@Controller('openai')
export class OpenAiController {
  constructor(private readonly openaiService: OpenAIService) {}

  @Post('translate-to-arabic')
  async translateToArabic(@Body() body: { value: string }) {
    const translated = await this.openaiService.translateToArabic(body.value);
    return { status: true, data: translated };
  }

  @Post('translate-to-english')
  async translateToEnglish(@Body() body: { value: string }) {
    const translated = await this.openaiService.translateToEnglish(body.value);
    return { status: true, data: translated };
  }

  @Post('translate-text')
  async translateText(@Body() translationDto: TranslationDto): Promise<any> {
    return this.openaiService.translateText(translationDto);
  }
}
