import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class OpenAIService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async translateToArabic(englishText: string) {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: `Translate the following English text to Arabic:\n\n${englishText}`,
          },
        ],
        max_tokens: 200,
      });

      const translatedText = response.choices[0]?.message?.content?.trim();
      return translatedText;
    } catch (error) {
      return { error: 'Translation failed', raw: error };
    }
  }

  async translateToEnglish(arabicText: string) {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a translation engine. Output ONLY the translation text. No explanations, no quotes, no punctuation beyond normal grammar.',
          },
          { role: 'user', content: `Translate to English:\n${arabicText}` },
        ],
        max_tokens: 120,
      });

      let translatedText = response.choices[0]?.message?.content?.trim() || '';

      // Defensive cleanup: strip surrounding quotes/backticks if present
      if (
        (translatedText.startsWith('"') && translatedText.endsWith('"')) ||
        (translatedText.startsWith('"') && translatedText.endsWith('"')) ||
        (translatedText.startsWith('`') && translatedText.endsWith('`'))
      ) {
        translatedText = translatedText.slice(1, -1).trim();
      }
      return translatedText;
    } catch (error) {
      return { error: 'Translation failed', raw: error };
    }
  }
}
