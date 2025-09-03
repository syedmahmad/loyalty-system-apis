import axios from 'axios';

export async function TriggerWhatsapp(
  encryptedPhone: string,
  otp: string,
  language_code: string,
): Promise<any> {
  try {
    const endpoint = process.env.NCMC_COMMUNICATION_WHATSAPP_ENDPOINT;
    const token = process.env.NCMC_COMMUNICATION_TOKEN;
    if (!endpoint || !token) {
      throw new Error('Missing communication service config');
    }

    await axios.post(
      endpoint,
      {
        template_id: process.env.NCMC_COMMUNICATION_WHATSAPP_TEMPLATE,
        language_code: language_code,
        to: [
          {
            number: encryptedPhone,
          },
        ],
        components: [
          {
            type: 'body',
            parameters: [
              {
                type: 'text',
                text: otp,
              },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
              {
                type: 'text',
                text: otp,
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    );
  } catch (err) {
    // maintain external logs
  }
}
