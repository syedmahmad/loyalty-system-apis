import { BadRequestException, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { z } from 'zod';

const translatedText = z.object({
  translatedText: z.record(
    z.string(),
    z.union([z.string(), z.object({}), z.array(z.string())]),
  ),
});

interface TranslateTextParams {
  text: string | object | string[];
  targetLanguage: string | string[];
  sourceLanguage?: string;
  model?: string;
  temperature?: number;
}

@Injectable()
export class OpenAIService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Translate English text → Arabic
   */
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
      console.error('translateToArabic Error:', error);
      return { error: 'Translation failed', raw: error };
    }
  }

  /**
   * Translate Arabic text → English
   */
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

      if (
        (translatedText.startsWith('"') && translatedText.endsWith('"')) ||
        (translatedText.startsWith("'") && translatedText.endsWith("'")) ||
        (translatedText.startsWith('`') && translatedText.endsWith('`'))
      ) {
        translatedText = translatedText.slice(1, -1).trim();
      }

      return translatedText;
    } catch (error) {
      console.error('translateToEnglish Error:', error);
      return { error: 'Translation failed', raw: error };
    }
  }

  /**
   * Analyze a car image using GPT-4.1-mini Vision API
   * Validates whether it’s a real vehicle image and extracts metadata.
   */
  async analyzeCarImage(imageUrl: string) {
    try {
      const systemPrompt =
        'You are an AI assistant specialized in analyzing car images. Your task is to determine if a provided image URL depicts a valid car image by evaluating it against a set of criteria. The image can be of a car\'\'\'s exterior or its interior.\n\n**General Criteria (Applicable to all images):**\n\n1. **Authenticity:** The image must be a real photograph of a car or its interior, not a drawing, painting, CGI rendering, or any other form of artistic representation.\n2. **Clarity:** The primary subject (the car or its interior components) must be in focus and clearly visible, not excessively blurry, dark, or obscured.\n\n**Specific Criteria for EXTERIOR Images:**\n\n1. **Content & Dominance:** The image must exclusively feature a **single car** as the primary subject, and this car must cover at least 50% of the image area.\n2. **Exclusivity:** No other cars should be clearly visible or prominent in the image. Objects or vehicles that are distant, out of focus, or non-dominant in the background are acceptable.\n3. **Background:** The background should be relatively clear and not distract from the main subject car.\n\n**Specific Criteria for INTERIOR Images:**\n\n1. **Content:** The image must clearly depict the inside of a car, such as the dashboard, steering wheel, seats, center console, or door panel. The view through the car\'\'\'s windows is acceptable.\n\n---\n\n**Output Format:**\n\nIf the image is **valid** based on the criteria above, provide a JSON response in the following format:\n`{ "isValid": true, "type": "sedan", "make": "Nissan", "model": "Patrol", "variant": "XE", "overview": "White Nissan Patrol XE full-size SUV in excellent exterior condition, featuring chrome grille and alloy wheels." }`\n\n**Important Instructions for Valid Images:**\n\n* **type**: For an **exterior** shot, infer the vehicle type (e.g., "sedan", "SUV", "coupe", "hatchback"). For an **interior** shot, set this value to `"interior"`.\n* **make, model, variant**: Infer the most accurate information possible. Use any visible text, badges, or logos on the car\'\'\'s exterior or interior (e.g., on the steering wheel, dashboard, or infotainment screen) to determine these details. If a specific detail cannot be determined, use `null`.\n* **overview**: Provide a brief, one-sentence description of the image.\n\nIf the image is **invalid**, provide a JSON response in the format:\n`{ "isValid": false, "description": "Explanation of why the image is invalid, referencing the specific criteria not met without mentioning the criteria number." }`\n\n**Example Invalid Description:** `"The image is invalid because the car is out of focus."` or `"The image is invalid because it contains multiple prominent cars."`';

      const messages = [
        {
          role: 'system',
          content: [{ type: 'text', text: systemPrompt }] as any,
        },
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: imageUrl } }] as any,
        },
      ];

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        response_format: { type: 'json_object' },
        messages: messages as any,
        max_tokens: 500,
      });

      const result = response.choices?.[0]?.message?.content;
      if (!result) throw new Error('No response from OpenAI.');

      const parsed = JSON.parse(result);

      if (!parsed.isValid) {
        throw new Error(parsed.description || 'Invalid vehicle image.');
      }

      return parsed;
    } catch (error: any) {
      console.error('OpenAI analyzeCarImage Error:', error?.message || error);
      throw new Error(
        `Image analysis failed: ${
          error?.message || 'Unable to analyze this image.'
        }`,
      );
    }
  }

  /**
   * Translates text to one or more target languages
   * Supports various input formats (string, object, array)
   *
   * @param params Translation parameters including a text and target languages
   * @returns Object containing translations for each requested language
   */
  async translateText(params: TranslateTextParams) {
    try {
      const { text, targetLanguage, sourceLanguage } = params;
      const languages = Array.isArray(targetLanguage)
        ? targetLanguage
        : [targetLanguage];
      const textToTranslate =
        typeof text === 'string' ? text : JSON.stringify(text);
      const sourceLanguagePart = sourceLanguage ? `from ${sourceLanguage}` : '';

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `Translate the text ${sourceLanguagePart} into ${languages.join(', ')}. Use appropriate local tone, cultural context, and regional expressions for each target language. Adapt formality levels and cultural nuances while maintaining the original meaning. Return JSON: {"translatedText": {"langCode": "translation"}}. Use language codes as keys.`,
          },
          {
            role: 'user',
            content: textToTranslate,
          },
        ],
        response_format: { type: 'json_object' },
      });

      if (response.choices[0].message.refusal) {
        throw new BadRequestException(response.choices[0].message.refusal);
      }

      return translatedText.parse(
        JSON.parse(response.choices[0].message.content),
      );
    } catch (error) {
      return { error: 'Translation failed', raw: error };
    }
  }
}
