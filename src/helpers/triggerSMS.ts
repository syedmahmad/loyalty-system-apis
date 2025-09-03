import axios from 'axios';

export async function TriggerSMS(
  encryptedPhone: string,
  otp: string,
  language_code: string,
): Promise<any> {
  try {
    const endpoint = process.env.NCMC_COMMUNICATION_ENDPOINT;
    const token = process.env.NCMC_COMMUNICATION_TOKEN;
    if (!endpoint || !token) {
      throw new Error('Missing communication service config');
    }

    await axios.post(
      endpoint,
      {
        template_id: process.env.NCMC_COMMUNICATION_TEMPLATE,
        language_code: language_code,
        to: [
          {
            number: encryptedPhone,
            dynamic_fields: { OTP: otp },
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
