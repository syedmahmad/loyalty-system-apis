import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private enabled: boolean = false;

  onModuleInit() {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const enabled = process.env.FIREBASE_ENABLED ?? 'true';
    this.enabled = enabled === 'true' || enabled === '1';

    if (!this.enabled) {
      this.logger.warn(
        'Firebase disabled by env; push sending will be a no-op.',
      );
      return;
    }

    if (!json) {
      this.logger.error(
        'FIREBASE_SERVICE_ACCOUNT_JSON not set; firebase not initialized.',
      );
      this.enabled = false;
      return;
    }

    try {
      let cred;
      if (json.trim().startsWith('{')) {
        cred = JSON.parse(json);
      } else {
        // If it's a file path, attempt to require it (rare in container env)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        cred = require(json);
      }

      admin.initializeApp({
        credential: admin.credential.cert(cred),
      });

      this.logger.log('Firebase admin initialized.');
    } catch (err) {
      this.enabled = false;
      this.logger.error('Failed to initialize firebase admin', err as any);
    }
  }

  async sendToToken(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    if (!this.enabled) {
      this.logger.debug('Firebase is disabled; skipping actual send.');
      return { success: true, simulated: true };
    }

    const message: admin.messaging.Message = {
      token,
      notification: { title, body },
      data: data || {},
    };

    try {
      const res = await admin.messaging().send(message);
      this.logger.log(`Firebase send success: ${res}`);
      return { success: true, id: res };
    } catch (err) {
      this.logger.error('Firebase send failed', err as any);
      throw err;
    }
  }

  async sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    if (!this.enabled) {
      this.logger.debug('Firebase is disabled; skipping multi-send.');
      return { success: true, simulated: true };
    }

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: { title, body },
      data: data || {},
    };

    // @ts-expect-error this is an async function
    const res = await admin.messaging().sendMulticast(message);
    return res;
  }
}
