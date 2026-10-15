import { ContactRepository } from './contact.repository.js';

export interface ContactInput {
  name?: string;
  email?: string;
  message?: string;
}

export class ContactService {
  static async submitMessage(data: ContactInput): Promise<{ status: string }> {
    await ContactRepository.insertMessage({
      name: data.name ?? '',
      email: data.email ?? '',
      message: data.message ?? '',
      created_at: new Date(),
    });
    return { status: 'ok' };
  }
}
