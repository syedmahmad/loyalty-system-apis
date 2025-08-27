import { Body, Controller, Post } from '@nestjs/common';
import { OpenAIService } from './openai.service';

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
}
