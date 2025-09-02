import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import * as keymanagement from 'oci-keymanagement';
import {
  ConfigFileAuthenticationDetailsProvider,
  ConfigFileReader,
} from 'oci-common';
import * as objectstorage from 'oci-objectstorage';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OciService {
  //KMS client initialization
  private readonly kmsEndpoint = process.env.OCI_ENDPOINT;
  private readonly kmsClient: keymanagement.KmsCryptoClient;
  private readonly objectStorageClient: objectstorage.ObjectStorageClient;
  private readonly namespace: string;

  constructor(private readonly configService: ConfigService) {
    try {
      const provider = new ConfigFileAuthenticationDetailsProvider(
        ConfigFileReader.DEFAULT_FILE_PATH,
        'DEFAULT',
      );
      this.kmsClient = new keymanagement.KmsCryptoClient({
        authenticationDetailsProvider: provider,
      });
      this.kmsClient.endpoint = this.kmsEndpoint!;

      this.objectStorageClient = new objectstorage.ObjectStorageClient({
        authenticationDetailsProvider: provider,
      });
    } catch (error) {
      console.error('Error initializing KMS client:', error);
    }
  }

  // Encrypt data
  async encryptData(plaintext: string): Promise<any> {
    try {
      if (!plaintext) {
        return '';
      }

      const keyId = process.env.OCI_KEYID;
      const keyVersionId = process.env.OCI_KEY_VERSION;
      // Prepare the encryption request body
      const encryptDataDetails = {
        keyId: keyId!,
        plaintext: Buffer.from(plaintext).toString('base64'), // Base64 encode the plaintext
        keyVersionId: keyVersionId,
        encryptionAlgorithm:
          keymanagement.models.EncryptDataDetails.EncryptionAlgorithm.Aes256Gcm, // Using AES-256-GCM algorithm
      };

      // Build the request object
      const encryptRequest = {
        encryptDataDetails,
      };

      // Send the encryption request
      const encryptResponse = await this.kmsClient.encrypt(encryptRequest);
      //console.log('Encryption succeeded. Response:', encryptResponse);
      return encryptResponse.encryptedData.ciphertext; // Return the encrypted response
    } catch (error) {
      console.error('Encryption failed with error:', error);
      throw new HttpException(
        'Encryption failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Decrypt data
  async decryptData(ciphertext: string): Promise<any> {
    try {
      if (!ciphertext) {
        return '';
      }

      const keyId = process.env.OCI_KEYID;
      const keyVersionId = process.env.OCI_KEY_VERSION;

      // Prepare the decryption details
      const decryptDataDetails = {
        keyId: keyId!,
        ciphertext: ciphertext,
        keyVersionId: keyVersionId,
        encryptionAlgorithm:
          keymanagement.models.DecryptDataDetails.EncryptionAlgorithm.Aes256Gcm,
      };

      // Prepare the request object
      const decryptRequest = {
        decryptDataDetails: decryptDataDetails,
      };

      // Send the decryption request
      const decryptResponse = await this.kmsClient.decrypt(decryptRequest);

      // Decode the base64 decrypted data
      const decryptedData = Buffer.from(
        decryptResponse.decryptedData.plaintext,
        'base64',
      ).toString();

      return decryptedData;
    } catch (error) {
      console.error('Decryption failed with error:', error);
      throw new Error('Decryption failed');
    }
  }

  async uploadBufferToOci(
    buffer: Buffer,
    bucketName: string,
    objectName: string,
  ) {
    try {
      const putObjectRequest: objectstorage.requests.PutObjectRequest = {
        namespaceName: process.env.OCI_NAMESPACE,
        bucketName: bucketName,
        objectName: objectName,
        contentLength: buffer.length,
        putObjectBody: buffer,
        contentType: 'application/octet-stream',
      };

      const uploadedResponse =
        await this.objectStorageClient.putObject(putObjectRequest);
      return uploadedResponse;
    } catch (error) {
      console.error('Failed to upload buffer to OCI bucket', error);
      throw error;
    }
  }
}
