import axios from 'axios';
import { Log } from 'src/logs/entities/log.entity';
import { Repository } from 'typeorm';

export async function TriggerSMS(
  encryptedPhone: string,
  otp: string,
  language_code: string,
  logRepo: Repository<Log>,
): Promise<any> {
  const endpoint = process.env.NCMC_COMMUNICATION_SMS_ENDPOINT;
  const token = process.env.NCMC_COMMUNICATION_TOKEN;
  if (!endpoint || !token) {
    throw new Error('Missing communication service config');
  }

  const body = {
    template_id: process.env.NCMC_COMMUNICATION_SMS_TEMPLATE,
    language_code: language_code,
    to: [
      {
        number: encryptedPhone,
        dynamic_fields: { OTP: otp },
      },
    ],
  };

  try {
    const res = await axios.post(endpoint, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    // log the external call
    const logs = await logRepo.create({
      requestBody: JSON.stringify(body),
      responseBody: JSON.stringify(res.data),
      url: endpoint,
      method: 'POST',
      statusCode: 200,
    } as Log);
    await logRepo.save(logs);
  } catch (err) {
    // maintain external logs
    // log the external call
    const logs = await logRepo.create({
      requestBody: JSON.stringify(body),
      responseBody: JSON.stringify(err),
      url: endpoint,
      method: 'POST',
      statusCode: 500,
    } as Log);
    await logRepo.save(logs);
  }
}
