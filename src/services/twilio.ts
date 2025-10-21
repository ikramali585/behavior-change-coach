import dotenv from 'dotenv';
dotenv.config();

import Twilio from 'twilio';

export type ParsedIncomingMessage = {
  from: string;
  body: string;
  message_sid: string;
  profile_name: string;
  wa_id: string;
};

function normalizeWhatsAppAddress(value: string): string {
  let v = (value || '').trim().replace(/\s+/g, '');
  // strip any accidental duplicate prefix
  v = v.replace(/^whatsapp:/i, '');
  if (!v.startsWith('+')) v = `+${v}`;
  return `whatsapp:${v}`;
}

export class TwilioService {
  private client: Twilio.Twilio;
  private whatsappNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const rawFrom = process.env.TWILIO_WHATSAPP_NUMBER || '';
  
    if (!accountSid || !authToken || !rawFrom) {
      throw new Error('Twilio credentials must be set in environment variables');
    }
  
    this.client = Twilio(accountSid, authToken);
    this.whatsappNumber = normalizeWhatsAppAddress(rawFrom);
  }

  
  async sendWhatsAppMessage(to: string, message: string): Promise<string | null> {
    try {
      let cleanPhone = to.replace('whatsapp:', '').replace(/\s+/g, '').trim();
      if (!cleanPhone.startsWith('+')) cleanPhone = `+${cleanPhone}`;
      const toWhatsApp = `whatsapp:${cleanPhone}`;

      // WhatsApp has a 1600 character limit per message
      const MAX_MESSAGE_LENGTH = 1600;
      
      if (message.length <= MAX_MESSAGE_LENGTH) {
        // Send single message if within limit
        console.log(`Sending message ${message} to ${toWhatsApp} from ${this.whatsappNumber}`);
        const msg = await this.client.messages.create({
          body: message,
          from: this.whatsappNumber,
          to: toWhatsApp,
        });

        console.log(`Message sent successfully: ${msg.sid}`);
        return msg.sid;
      } else {
        // Split message into multiple parts
        console.log(`Message exceeds ${MAX_MESSAGE_LENGTH} characters, splitting into multiple messages`);
        const messageParts = this.splitMessage(message, MAX_MESSAGE_LENGTH);
        let lastMessageSid: string | null = null;

        for (let i = 0; i < messageParts.length; i++) {
          const partNumber = i + 1;
          const totalParts = messageParts.length;
          const partMessage = `[${partNumber}/${totalParts}] ${messageParts[i]}`;
          
          console.log(`Sending part ${partNumber}/${totalParts} to ${toWhatsApp}`);
          const msg = await this.client.messages.create({
            body: partMessage,
            from: this.whatsappNumber,
            to: toWhatsApp,
          });

          console.log(`Part ${partNumber} sent successfully: ${msg.sid}`);
          lastMessageSid = msg.sid;
          
          // Add a small delay between messages to avoid rate limiting
          if (i < messageParts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        return lastMessageSid;
      }
    } catch (err) {
      console.error('Error sending WhatsApp message:', err);
      return null;
    }
  }

  private splitMessage(message: string, maxLength: number): string[] {
    const parts: string[] = [];
    let remainingMessage = message;

    while (remainingMessage.length > 0) {
      if (remainingMessage.length <= maxLength) {
        parts.push(remainingMessage);
        break;
      }

      // Find the last space before the limit to avoid breaking words
      let splitIndex = maxLength;
      const lastSpaceIndex = remainingMessage.lastIndexOf(' ', maxLength);
      
      // If we found a space and it's not too close to the beginning, use it
      if (lastSpaceIndex > maxLength * 0.8) {
        splitIndex = lastSpaceIndex;
      }

      parts.push(remainingMessage.substring(0, splitIndex).trim());
      remainingMessage = remainingMessage.substring(splitIndex).trim();
    }

    return parts;
  }

  parseIncomingMessage(requestData: Record<string, string | undefined>): ParsedIncomingMessage {
    try {
      return {
        from: requestData['From'] || '',
        body: requestData['Body'] || '',
        message_sid: requestData['MessageSid'] || '',
        profile_name: requestData['ProfileName'] || '',
        wa_id: requestData['WaId'] || '',
      };
    } catch (err) {
      console.error('Error parsing incoming message:', err);
      return { from: '', body: '', message_sid: '', profile_name: '', wa_id: '' };
    }
  }
}

export const twilioService = new TwilioService();


