import * as crypto from 'crypto';
/**
 * Encrypts a string using AES-256-CBC algorithm.
 * @param data - The plaintext string to encrypt.
 * @returns The encrypted data as a hex string.
 */
export function encrypt(data: string): string {
  // Create a cipher object using the AES-256-CBC algorithm, key, and IV
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(process.env.ENCRYPTION_KEY, 'hex'), // Convert the key from hex string to Buffer
    Buffer.from(process.env.ENCRYPTION_IV, 'hex'), // Convert the IV from hex string to Buffer
  );

  // Encrypt the data: update processes the input, final completes encryption
  const encrypted = Buffer.concat([
    cipher.update(data, 'utf8'), // Encrypt the input data (utf8 encoding)
    cipher.final(), // Finalize encryption
  ]);

  // Return the encrypted data as a hex string
  return encrypted.toString('hex');
}

/**
 * Decrypts a string that was encrypted with AES-256-CBC algorithm.
 * @param encryptedData - The encrypted data as a hex string.
 * @returns The decrypted plaintext string.
 */
export function decrypt(encryptedData: string): string {
  try {
    // Create a decipher object using the AES-256-CBC algorithm, key, and IV
    // This will be used to reverse the encryption process
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(process.env.ENCRYPTION_KEY, 'hex'), // Convert the key from hex string to Buffer
      Buffer.from(process.env.ENCRYPTION_IV, 'hex'), // Convert the IV from hex string to Buffer
    );

    // Decrypt the data:
    // - Convert the encrypted hex string back to a Buffer
    // - Use decipher.update to process the encrypted data
    // - Use decipher.final to complete the decryption
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData, 'hex')), // Decrypt the input data
      decipher.final(), // Finalize decryption
    ]);

    // Convert the decrypted Buffer back to a utf8 string and return it
    return decrypted.toString('utf8');
  } catch (error) {
    // If decryption fails, log the error and throw a new error
    console.error('Decryption error:', error.message);
    throw new Error('Failed to decrypt data');
  }
}
